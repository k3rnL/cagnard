package authn

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
	"github.com/k3rnl/cagnard/backend-go/internal/identity"
)

type UserResolver struct {
	cfg           *config.CagnardConfig
	sessions      *SessionService
	oidcMu        sync.Mutex
	oidcProviders map[string]*oidcRuntime
	clock         func() time.Time
}

func NewUserResolver(cfg *config.CagnardConfig) *UserResolver {
	return &UserResolver{cfg: cfg, sessions: NewSessionService(cfg), oidcProviders: map[string]*oidcRuntime{}, clock: time.Now}
}
func (r *UserResolver) provider(id string) (config.AuthProviderConfig, bool) {
	for _, p := range r.cfg.Auth.Providers {
		if p.ID == id && p.Enabled {
			return p, true
		}
	}
	if d := r.cfg.Auth.Development; id == "development" && d != nil && d.Enabled && len(r.cfg.Auth.Providers) == 0 {
		return config.AuthProviderConfig{ID: id, Type: "development", Enabled: true, Users: d.Users}, true
	}
	return config.AuthProviderConfig{}, false
}
func (r *UserResolver) Providers() []ProviderMetadata {
	out := []ProviderMetadata{}
	for _, p := range r.cfg.Auth.Providers {
		if !p.Enabled {
			continue
		}
		label := p.Label
		if label == "" {
			label = p.ID
		}
		url := "/api/auth/providers/" + p.ID + "/start"
		m := ProviderMetadata{ID: p.ID, Label: label, Kind: p.Type, LoginURL: &url, Fields: []ProviderField{}, Capabilities: []string{"browser-redirect"}}
		if p.Type == "static" {
			url = "/api/auth/login"
			m.Fields = []ProviderField{{"username", "User", "text", true}, {"password", "Password", "password", true}}
			m.Capabilities = []string{"password-login"}
		}
		out = append(out, m)
	}
	return out
}
func (r *UserResolver) revision(p config.AuthProviderConfig, verifier string) string {
	paths := []string{}
	for _, m := range p.GroupMappings {
		if !slices.Contains(paths, m.Claim) {
			paths = append(paths, m.Claim)
		}
	}
	sort.Strings(paths)
	data, _ := json.Marshal([]any{p.ID, p.Type, p.Issuer, p.ClientID, p.Scopes, paths, verifier})
	mac := hmac.New(sha256.New, PurposeKey(r.cfg, "identity-revision"))
	mac.Write(data)
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
func (r *UserResolver) LoginStatic(providerID, username, password string) (ResolvedUser, string, *Failure) {
	p, ok := r.provider(providerID)
	failure := &Failure{"authentication_failed", "Invalid username or password"}
	if !ok || p.Type != "static" {
		return ResolvedUser{}, "", failure
	}
	for _, u := range p.Users {
		if u.ID == username && u.Enabled && u.Credential != nil {
			if !VerifyPassword(password, u.Credential.Verifier) {
				slog.Info("authentication", "provider", p.ID, "outcome", "failure")
				return ResolvedUser{}, "", failure
			}
			now := r.clock().Unix()
			e := sessionEvidence{Version: 2, ProviderID: p.ID, Subject: u.ID, Revision: r.revision(p, u.Credential.Verifier), IssuedAt: now, ExpiresAt: now + r.cfg.Auth.Session.TTLSeconds}
			resolved, f := r.Resolve(RequestIdentity{&e})
			if f != nil {
				return resolved, "", f
			}
			token, err := r.sessions.Issue(e)
			if err != nil {
				return ResolvedUser{}, "", invalidSession()
			}
			slog.Info("authentication", "provider", p.ID, "principal", resolved.Profile.ID, "outcome", "success")
			return resolved, token, nil
		}
	}
	// Unknown/disabled users also perform one password derivation. Configured
	// iteration counts can differ, so this is not a constant-time login protocol.
	VerifyPassword(password, "pbkdf2-sha256:120000:Y2FnbmFyZC1kdW1teS1zYWx0:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
	slog.Info("authentication", "provider", p.ID, "outcome", "failure")
	return ResolvedUser{}, "", failure
}
func (r *UserResolver) Authenticate(req *http.Request) (RequestIdentity, *Failure) {
	if req.Header.Get("Authorization") != "" {
		return RequestIdentity{}, invalidSession()
	}
	if d := r.cfg.Auth.Development; d != nil && d.Enabled && len(r.cfg.Auth.Providers) == 0 {
		subject := req.Header.Get("X-Cagnard-User")
		if subject == "" {
			subject = d.DefaultUser
		}
		return r.DevelopmentIdentity(subject)
	}
	cookie, err := req.Cookie(r.sessions.CookieName())
	if err != nil {
		return RequestIdentity{}, invalidSession()
	}
	e, f := r.sessions.Verify(cookie.Value)
	if f != nil {
		return RequestIdentity{}, f
	}
	i := RequestIdentity{&e}
	if _, f = r.Resolve(i); f != nil {
		return RequestIdentity{}, f
	}
	return i, nil
}
func (r *UserResolver) DevelopmentIdentity(subject string) (RequestIdentity, *Failure) {
	p, ok := r.provider("development")
	if !ok {
		return RequestIdentity{}, invalidSession()
	}
	now := r.clock().Unix()
	e := sessionEvidence{Version: 2, ProviderID: p.ID, Subject: subject, Revision: r.revision(p, ""), IssuedAt: now, ExpiresAt: now + r.cfg.Auth.Session.TTLSeconds}
	i := RequestIdentity{&e}
	_, f := r.Resolve(i)
	return i, f
}
func (r *UserResolver) Resolve(i RequestIdentity) (ResolvedUser, *Failure) {
	if i.evidence == nil {
		return ResolvedUser{}, invalidSession()
	}
	e := *i.evidence
	if !validLifetime(e, r.clock(), r.cfg.Auth.Session.TTLSeconds) {
		return ResolvedUser{}, &Failure{"session_expired", "Authentication has expired"}
	}
	p, ok := r.provider(e.ProviderID)
	if !ok || p.Issuer != e.Issuer {
		return ResolvedUser{}, invalidSession()
	}
	groups := []string{}
	storageKey := ""
	display := e.DisplayName
	switch p.Type {
	case "static", "development":
		found := false
		for _, u := range p.Users {
			if u.ID == e.Subject && u.Enabled {
				verifier := ""
				if p.Type == "static" {
					if u.Credential == nil {
						break
					}
					verifier = u.Credential.Verifier
				}
				if e.Revision != r.revision(p, verifier) {
					break
				}
				found = true
				groups = append(groups, u.Groups...)
				storageKey = u.StorageKey
				display = u.DisplayName
				break
			}
		}
		if !found {
			return ResolvedUser{}, invalidSession()
		}
	case "oidc":
		if e.Revision != r.revision(p, "") {
			return ResolvedUser{}, invalidSession()
		}
		for _, m := range p.GroupMappings {
			if slices.Contains(e.Claims[m.Claim], m.Value) && !slices.Contains(groups, m.Group) {
				groups = append(groups, m.Group)
			}
		}
		for _, m := range p.StorageKeys {
			if m.Subject == e.Subject {
				storageKey = m.StorageKey
			}
		}
	default:
		return ResolvedUser{}, invalidSession()
	}
	if display == "" {
		display = e.Subject
	}
	if len(display) > 256 {
		display = string([]rune(display)[:min(128, len([]rune(display)))])
	}
	id := identity.ID(p.ID, p.Issuer, e.Subject)
	if storageKey == "" {
		storageKey = identity.DefaultStorageKey(id)
	}
	if !identity.ValidStorageKey(storageKey) {
		return ResolvedUser{}, invalidSession()
	}
	return ResolvedUser{Profile: UserProfile{ID: id, ProviderID: p.ID, Subject: e.Subject, DisplayName: display, Groups: groups}, Issuer: p.Issuer, StorageKey: storageKey, AuthMode: p.Type, ExpiresAt: e.ExpiresAt}, nil
}
func (r *UserResolver) SessionCookie(token string) string { return r.sessions.Cookie(token) }
func (r *UserResolver) ClearSessionCookie() string        { return r.sessions.ClearCookie() }
func (r *UserResolver) ValidMutation(req *http.Request) bool {
	return req.Header.Get("Origin") == strings.TrimRight(r.cfg.Auth.PublicURL, "/") && req.Header.Get("X-Cagnard-Request") == "1"
}
