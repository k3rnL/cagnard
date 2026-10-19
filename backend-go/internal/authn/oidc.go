package authn

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	oidc "github.com/coreos/go-oidc/v3/oidc"
	"github.com/k3rnl/cagnard/backend-go/internal/config"
	"golang.org/x/oauth2"
)

const transactionTTL = 300

type oidcRuntime struct {
	provider *oidc.Provider
	client   *http.Client
	failedAt time.Time
}
type transaction struct {
	ProviderID, Revision, State, Nonce, Verifier, ReturnTo string
	ExpiresAt                                              int64
}

// boundedTransport limits untrusted discovery, token and key responses and forbids
// cleartext endpoints except explicitly configured local development endpoints.
type boundedTransport struct {
	base          http.RoundTripper
	allowLoopback bool
}

func (t boundedTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.Scheme != "https" && !(t.allowLoopback && req.URL.Scheme == "http" && config.IsLoopbackURL(req.URL.String())) {
		return nil, fmt.Errorf("OIDC endpoint must use HTTPS")
	}
	res, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	res.Body = &limitedBody{Reader: io.LimitReader(res.Body, 1024*1024), Closer: res.Body}
	return res, nil
}

type limitedBody struct {
	io.Reader
	io.Closer
}

func (r *UserResolver) oidcProvider(ctx context.Context, p config.AuthProviderConfig) (*oidcRuntime, error) {
	r.oidcMu.Lock()
	defer r.oidcMu.Unlock()
	if rt := r.oidcProviders[p.ID]; rt != nil {
		if rt.provider != nil {
			return rt, nil
		}
		if r.clock().Sub(rt.failedAt) < 30*time.Second {
			return nil, fmt.Errorf("provider temporarily unavailable")
		}
	}
	client := &http.Client{Timeout: 8 * time.Second, Transport: boundedTransport{http.DefaultTransport, r.cfg.Auth.AllowInsecureLoopback}}
	// JWKS fetches retain a cancellable request context and the bounded client.
	provider, err := oidc.NewProvider(oidc.ClientContext(ctx, client), p.Issuer)
	if err != nil {
		r.oidcProviders[p.ID] = &oidcRuntime{failedAt: r.clock()}
		return nil, fmt.Errorf("provider temporarily unavailable")
	}
	endpoint, parseErr := url.Parse(provider.Endpoint().AuthURL)
	if parseErr != nil || endpoint.Host == "" || endpoint.User != nil || endpoint.Fragment != "" || (endpoint.Scheme != "https" && !(r.cfg.Auth.AllowInsecureLoopback && endpoint.Scheme == "http" && config.IsLoopbackURL(endpoint.String()))) {
		return nil, fmt.Errorf("provider authorization endpoint is invalid")
	}
	rt := &oidcRuntime{provider: provider, client: client}
	r.oidcProviders[p.ID] = rt
	return rt, nil
}
func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("secure random generator unavailable")
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
func SafeReturnPath(value string) bool {
	u, err := url.Parse(value)
	return err == nil && strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//") && !strings.ContainsAny(value, "\\\r\n") && u.Scheme == "" && u.Host == "" && !strings.HasPrefix(u.Path, "/api/") && !strings.HasPrefix(u.Path, "//") && !strings.ContainsAny(u.Path, "\\\r\n")
}
func (r *UserResolver) transactionName() string { return cookieName(r.cfg, "OIDC-v2") }
func (r *UserResolver) ClearTransactionCookie() string {
	return makeCookie(r.cfg, r.transactionName(), "", -1)
}
func (r *UserResolver) oauthConfig(p config.AuthProviderConfig, rt *oidcRuntime) oauth2.Config {
	scopes := append([]string{}, p.Scopes...)
	if !slices.Contains(scopes, oidc.ScopeOpenID) {
		scopes = append([]string{oidc.ScopeOpenID}, scopes...)
	}
	return oauth2.Config{ClientID: p.ClientID, ClientSecret: p.ClientSecret, Endpoint: rt.provider.Endpoint(), RedirectURL: strings.TrimRight(r.cfg.Auth.PublicURL, "/") + "/api/auth/providers/" + p.ID + "/callback", Scopes: scopes}
}
func (r *UserResolver) StartOIDC(ctx context.Context, providerID, returnTo string) (authorizationURL, cookie string, err error) {
	p, ok := r.provider(providerID)
	if !ok || p.Type != "oidc" {
		return "", "", fmt.Errorf("provider unavailable")
	}
	if returnTo == "" {
		returnTo = "/"
	}
	if !SafeReturnPath(returnTo) {
		return "", "", fmt.Errorf("invalid return path")
	}
	rt, err := r.oidcProvider(ctx, p)
	if err != nil {
		return "", "", err
	}
	t := transaction{ProviderID: p.ID, Revision: r.revision(p, ""), State: randomToken(), Nonce: randomToken(), Verifier: oauth2.GenerateVerifier(), ReturnTo: returnTo, ExpiresAt: r.clock().Unix() + transactionTTL}
	token, err := protectedCodec(r.cfg, "transaction", transactionTTL).Encode(r.transactionName(), t)
	if err != nil {
		return "", "", fmt.Errorf("cannot start login")
	}
	c := r.oauthConfig(p, rt)
	return c.AuthCodeURL(t.State, oidc.Nonce(t.Nonce), oauth2.S256ChallengeOption(t.Verifier)), makeCookie(r.cfg, r.transactionName(), token, transactionTTL), nil
}
func equalSecret(a, b string) bool {
	return a != "" && b != "" && subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
func (r *UserResolver) CompleteOIDC(req *http.Request, providerID string) (token, returnTo string, err error) {
	fail := func() (string, string, error) {
		return "", "", fmt.Errorf("SSO login could not be completed; please start again")
	}
	p, ok := r.provider(providerID)
	if !ok || p.Type != "oidc" {
		return fail()
	}
	cookie, e := req.Cookie(r.transactionName())
	if e != nil {
		return fail()
	}
	var t transaction
	if e = protectedCodec(r.cfg, "transaction", transactionTTL).Decode(r.transactionName(), cookie.Value, &t); e != nil || t.ProviderID != p.ID || t.Revision != r.revision(p, "") || t.ExpiresAt <= r.clock().Unix() || t.ExpiresAt > r.clock().Unix()+transactionTTL || !SafeReturnPath(t.ReturnTo) {
		return fail()
	}
	q := req.URL.Query()
	if len(q["state"]) != 1 || !equalSecret(q.Get("state"), t.State) || len(q["code"]) != 1 || q.Get("code") == "" || q.Get("error") != "" {
		return fail()
	}
	rt, e := r.oidcProvider(req.Context(), p)
	if e != nil {
		return fail()
	}
	ctx := oidc.ClientContext(req.Context(), rt.client)
	c := r.oauthConfig(p, rt)
	exchanged, e := c.Exchange(ctx, q.Get("code"), oauth2.VerifierOption(t.Verifier))
	if e != nil {
		return fail()
	}
	raw, ok := exchanged.Extra("id_token").(string)
	if !ok || len(raw) > 128*1024 {
		return fail()
	}
	verified, e := rt.provider.Verifier(&oidc.Config{ClientID: p.ClientID, SupportedSigningAlgs: []string{oidc.RS256, oidc.ES256, oidc.PS256}}).Verify(ctx, raw)
	if e != nil || verified.Issuer != p.Issuer || !equalSecret(verified.Nonce, t.Nonce) || safeLength(verified.Subject, 512) != nil {
		return fail()
	}
	var claims map[string]any
	if verified.Claims(&claims) != nil {
		return fail()
	}
	azp, hasAZP := claims["azp"]
	if (len(verified.Audience) > 1 && !hasAZP) || (hasAZP && azp != p.ClientID) {
		return fail()
	}
	// Group evidence comes only from the validated ID token. UserInfo is intentionally
	// unused, avoiding ambiguous subject correlation and an additional token-bearing call.
	evidenceClaims, e := selectedClaims(claims, p.GroupMappings)
	if e != nil {
		return fail()
	}
	name, _ := claims["name"].(string)
	if len(name) > 256 {
		return fail()
	}
	now := r.clock().Unix()
	exp := now + r.cfg.Auth.Session.TTLSeconds
	if verified.Expiry.Unix() < exp {
		exp = verified.Expiry.Unix()
	}
	evidence := sessionEvidence{Version: 2, ProviderID: p.ID, Issuer: p.Issuer, Subject: verified.Subject, DisplayName: name, Revision: r.revision(p, ""), Claims: evidenceClaims, IssuedAt: now, ExpiresAt: exp}
	if _, f := r.Resolve(RequestIdentity{&evidence}); f != nil {
		return fail()
	}
	token, e = r.sessions.Issue(evidence)
	if e != nil {
		return fail()
	}
	return token, t.ReturnTo, nil
}
func claimAt(claims map[string]any, pointer string) any {
	var current any = claims
	for _, part := range strings.Split(strings.TrimPrefix(pointer, "/"), "/") {
		key := strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")
		switch value := current.(type) {
		case map[string]any:
			current = value[key]
		case []any:
			index, err := strconv.Atoi(key)
			if err != nil || index < 0 || index >= len(value) || strconv.Itoa(index) != key {
				return nil
			}
			current = value[index]
		default:
			return nil
		}
	}
	return current
}
func selectedClaims(claims map[string]any, mappings []config.GroupMapping) (map[string][]string, error) {
	out := map[string][]string{}
	for _, m := range mappings {
		if _, exists := out[m.Claim]; exists {
			continue
		}
		values := []string{}
		switch v := claimAt(claims, m.Claim).(type) {
		case nil:
		case string:
			values = append(values, v)
		case []any:
			for _, item := range v {
				text, ok := item.(string)
				if !ok {
					return nil, fmt.Errorf("mapped claim must be a string or array of strings")
				}
				values = append(values, text)
			}
		default:
			return nil, fmt.Errorf("mapped claim must be a string or array of strings")
		}
		if len(values) > 64 {
			return nil, fmt.Errorf("mapped claim exceeds bounds")
		}
		for _, v := range values {
			if len(v) > 256 {
				return nil, fmt.Errorf("mapped claim exceeds bounds")
			}
		}
		out[m.Claim] = values
	}
	return out, nil
}
