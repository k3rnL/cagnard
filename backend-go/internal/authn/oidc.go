package authn

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"log/slog"
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
	failure  *oidcFailure
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
	providerID    string
}

func (t boundedTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.Scheme != "https" && !(t.allowLoopback && req.URL.Scheme == "http" && config.IsLoopbackURL(req.URL.String())) {
		failure := oidcError("http_request", "https_required")
		slog.Warn("oidc_http", "provider", t.providerID, "failure", failure)
		return nil, failure
	}
	res, err := t.base.RoundTrip(req)
	if err != nil {
		slog.Warn("oidc_http", "provider", t.providerID, "failure", diagnoseOIDC("http_request", err))
		return nil, err
	}
	if res.StatusCode >= 400 {
		slog.Warn("oidc_http", "provider", t.providerID, "failure", &oidcFailure{Stage: "http_request", Reason: "http_error", HTTPStatus: res.StatusCode})
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
			failure := *rt.failure
			failure.Backoff = true
			return nil, &failure
		}
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if transport.TLSClientConfig == nil {
		transport.TLSClientConfig = &tls.Config{}
	}
	// Explicit operator exception, isolated from all other providers and clients.
	transport.TLSClientConfig.InsecureSkipVerify = p.TrustAllCertificates
	client := &http.Client{Timeout: 8 * time.Second, Transport: boundedTransport{transport, r.cfg.Auth.AllowInsecureLoopback, p.ID}}
	// JWKS fetches retain a cancellable request context and the bounded client.
	provider, err := oidc.NewProvider(oidc.ClientContext(ctx, client), p.Issuer)
	if err != nil {
		transport.CloseIdleConnections()
		failure := diagnoseOIDC("discovery", err)
		r.oidcProviders[p.ID] = &oidcRuntime{failedAt: r.clock(), failure: failure}
		return nil, failure
	}
	endpoint, parseErr := url.Parse(provider.Endpoint().AuthURL)
	if parseErr != nil || endpoint.Host == "" || endpoint.User != nil || endpoint.Fragment != "" || (endpoint.Scheme != "https" && !(r.cfg.Auth.AllowInsecureLoopback && endpoint.Scheme == "http" && config.IsLoopbackURL(endpoint.String()))) {
		transport.CloseIdleConnections()
		failure := oidcError("discovery", "invalid_authorization_endpoint")
		r.oidcProviders[p.ID] = &oidcRuntime{failedAt: r.clock(), failure: failure}
		return nil, failure
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
		return "", "", oidcError("start", "provider_unavailable")
	}
	if returnTo == "" {
		returnTo = "/"
	}
	if !SafeReturnPath(returnTo) {
		return "", "", oidcError("start", "invalid_return_path")
	}
	rt, err := r.oidcProvider(ctx, p)
	if err != nil {
		return "", "", err
	}
	t := transaction{ProviderID: p.ID, Revision: r.revision(p, ""), State: randomToken(), Nonce: randomToken(), Verifier: oauth2.GenerateVerifier(), ReturnTo: returnTo, ExpiresAt: r.clock().Unix() + transactionTTL}
	token, err := protectedCodec(r.cfg, "transaction", transactionTTL).Encode(r.transactionName(), t)
	if err != nil {
		return "", "", oidcError("transaction", "cookie_encode_failed")
	}
	c := r.oauthConfig(p, rt)
	return c.AuthCodeURL(t.State, oidc.Nonce(t.Nonce), oauth2.S256ChallengeOption(t.Verifier)), makeCookie(r.cfg, r.transactionName(), token, transactionTTL), nil
}
func equalSecret(a, b string) bool {
	return a != "" && b != "" && subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
func (r *UserResolver) CompleteOIDC(req *http.Request, providerID string) (token, returnTo string, err error) {
	fail := func(stage, reason string) (string, string, error) {
		return "", "", oidcError(stage, reason)
	}
	p, ok := r.provider(providerID)
	if !ok || p.Type != "oidc" {
		return fail("callback", "provider_unavailable")
	}
	cookie, e := req.Cookie(r.transactionName())
	if e != nil {
		return fail("transaction", "cookie_missing")
	}
	var t transaction
	if e = protectedCodec(r.cfg, "transaction", transactionTTL).Decode(r.transactionName(), cookie.Value, &t); e != nil {
		return fail("transaction", "cookie_invalid_or_expired")
	}
	if t.ProviderID != p.ID || t.Revision != r.revision(p, "") {
		return fail("transaction", "provider_or_configuration_changed")
	}
	if t.ExpiresAt <= r.clock().Unix() || t.ExpiresAt > r.clock().Unix()+transactionTTL {
		return fail("transaction", "expired")
	}
	if !SafeReturnPath(t.ReturnTo) {
		return fail("transaction", "invalid_return_path")
	}
	q := req.URL.Query()
	if len(q["state"]) != 1 || !equalSecret(q.Get("state"), t.State) {
		return fail("transaction", "state_mismatch")
	}
	if q.Get("error") != "" {
		switch q.Get("error") {
		case "access_denied", "login_required", "interaction_required", "consent_required", "temporarily_unavailable", "server_error", "invalid_request", "unauthorized_client", "unsupported_response_type", "invalid_scope":
			return fail("callback", q.Get("error"))
		}
		return fail("callback", "provider_returned_error")
	}
	if len(q["code"]) != 1 || q.Get("code") == "" {
		return fail("callback", "code_missing_or_repeated")
	}
	rt, e := r.oidcProvider(req.Context(), p)
	if e != nil {
		return "", "", e
	}
	ctx := oidc.ClientContext(req.Context(), rt.client)
	c := r.oauthConfig(p, rt)
	exchanged, e := c.Exchange(ctx, q.Get("code"), oauth2.VerifierOption(t.Verifier))
	if e != nil {
		return "", "", diagnoseOIDC("token_exchange", e)
	}
	raw, ok := exchanged.Extra("id_token").(string)
	if !ok || len(raw) > 128*1024 {
		return fail("token_exchange", "id_token_missing_or_too_large")
	}
	verified, e := rt.provider.Verifier(&oidc.Config{ClientID: p.ClientID, SupportedSigningAlgs: []string{oidc.RS256, oidc.ES256, oidc.PS256}}).Verify(ctx, raw)
	if e != nil {
		return "", "", diagnoseOIDC("id_token", e)
	}
	if verified.Issuer != p.Issuer {
		return fail("id_token", "issuer_mismatch")
	}
	if !equalSecret(verified.Nonce, t.Nonce) {
		return fail("id_token", "nonce_mismatch")
	}
	if safeLength(verified.Subject, 512) != nil {
		return fail("id_token", "subject_invalid")
	}
	var claims map[string]any
	if verified.Claims(&claims) != nil {
		return fail("claims", "invalid_claims")
	}
	azp, hasAZP := claims["azp"]
	if (len(verified.Audience) > 1 && !hasAZP) || (hasAZP && azp != p.ClientID) {
		return fail("id_token", "authorized_party_mismatch")
	}
	// Group evidence comes only from the validated ID token. UserInfo is intentionally
	// unused, avoiding ambiguous subject correlation and an additional token-bearing call.
	evidenceClaims, e := selectedClaims(claims, p.GroupMappings)
	if e != nil {
		return fail("claims", "mapped_claim_invalid_or_too_large")
	}
	name, _ := claims["name"].(string)
	if len(name) > 256 {
		return fail("claims", "display_name_too_large")
	}
	now := r.clock().Unix()
	exp := now + r.cfg.Auth.Session.TTLSeconds
	if verified.Expiry.Unix() < exp {
		exp = verified.Expiry.Unix()
	}
	evidence := sessionEvidence{Version: 2, ProviderID: p.ID, Issuer: p.Issuer, Subject: verified.Subject, DisplayName: name, Revision: r.revision(p, ""), Claims: evidenceClaims, IssuedAt: now, ExpiresAt: exp}
	if _, f := r.Resolve(RequestIdentity{&evidence}); f != nil {
		return fail("session", "identity_rejected")
	}
	token, e = r.sessions.Issue(evidence)
	if e != nil {
		return fail("session", "cookie_encode_failed")
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
