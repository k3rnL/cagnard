package authn

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
	"github.com/k3rnl/cagnard/backend-go/internal/testconfig"
)

func staticConfig() *config.CagnardConfig {
	c := &config.CagnardConfig{Auth: testconfig.Development()}
	c.Auth.Development = nil
	c.Auth.Providers = []config.AuthProviderConfig{{ID: "local", Type: "static", Enabled: true, Users: []config.ConfiguredUser{{ID: "alice", Enabled: true, StorageKey: "alice", Groups: []string{"engineering"}, Credential: &config.StaticUserCredentialConfig{Verifier: testconfig.Verifier}}}}}
	return c
}
func loggedIn(t *testing.T, r *UserResolver) (RequestIdentity, string) {
	t.Helper()
	_, token, f := r.LoginStatic("local", "alice", "cagnard")
	if f != nil {
		t.Fatal(f)
	}
	req := httptest.NewRequest("GET", "/api/session", nil)
	req.AddCookie(&http.Cookie{Name: r.sessions.CookieName(), Value: token})
	i, f := r.Authenticate(req)
	if f != nil {
		t.Fatal(f)
	}
	return i, token
}
func TestStaticSessionLifecycle(t *testing.T) {
	c := staticConfig()
	r := NewUserResolver(c)
	i, token := loggedIn(t, r)
	principal, f := r.Resolve(i)
	if f != nil || principal.Profile.ID == "alice" || principal.StorageKey != "alice" {
		t.Fatalf("bad principal %#v %v", principal, f)
	}
	if strings.Contains(token, "alice") || strings.Contains(token, "engineering") {
		t.Fatal("session is not protected")
	}
	c.Auth.Providers[0].Users[0].Groups = []string{"auditors"}
	principal, f = r.Resolve(i)
	if f != nil || len(principal.Profile.Groups) != 1 || principal.Profile.Groups[0] != "auditors" {
		t.Fatal("stale static groups")
	}
	c.Auth.Providers[0].Users[0].Enabled = false
	if _, f = r.Resolve(i); f == nil {
		t.Fatal("disabled user retained session")
	}
	c.Auth.Providers[0].Users[0].Enabled = true
	c.Auth.Providers[0].Users[0].Credential.Verifier += "changed"
	if _, f = r.Resolve(i); f == nil {
		t.Fatal("password revision ignored")
	}
	c.Auth.Providers[0].Users = nil
	if _, f = r.Resolve(i); f == nil {
		t.Fatal("deleted user retained session")
	}
}
func TestSessionTamperingExpiryRotationAndBounds(t *testing.T) {
	c := staticConfig()
	r := NewUserResolver(c)
	_, token := loggedIn(t, r)
	for _, bad := range []string{"", token + "x", "eyJhbGciOiJIUzI1NiJ9.e30.invalid", strings.Repeat("x", 4000)} {
		if _, f := r.sessions.Verify(bad); f == nil {
			t.Fatal("accepted invalid token")
		}
	}
	r.sessions.clock = func() time.Time { return time.Now().Add(2 * time.Hour) }
	if _, f := r.sessions.Verify(token); f == nil {
		t.Fatal("expiry ignored")
	}
	other := staticConfig()
	other.Auth.Session.Key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
	if _, f := NewSessionService(other).Verify(token); f == nil {
		t.Fatal("key rotation ignored")
	}
	e := sessionEvidence{Version: 2, ProviderID: "local", Subject: strings.Repeat("a", 5000)}
	if _, err := r.sessions.Issue(e); err == nil {
		t.Fatal("oversize session accepted")
	}
	c.Auth.Session.SecureCookies = true
	cookie := NewSessionService(c).Cookie("value")
	for _, part := range []string{"__Host-", "HttpOnly", "Secure", "SameSite=Lax", "Path=/"} {
		if !strings.Contains(cookie, part) {
			t.Fatalf("missing %s", part)
		}
	}
}
func TestBearerAndPartialIdentitiesAlwaysRejected(t *testing.T) {
	for _, dev := range []bool{false, true} {
		c := staticConfig()
		if dev {
			c.Auth = testconfig.Development()
		}
		r := NewUserResolver(c)
		for _, token := range []string{"garbage", "e30.e30.", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJhbGljZSIsImlzcyI6Imh0dHBzOi8vaWRwIiwiZXhwIjoxfQ.", ""} {
			req := httptest.NewRequest("GET", "/api/session", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			if _, f := r.Authenticate(req); f == nil {
				t.Fatal("bearer accepted")
			}
		}
	}
	if _, f := NewUserResolver(staticConfig()).Resolve(RequestIdentity{}); f == nil {
		t.Fatal("empty evidence accepted")
	}
}
func TestSelectedClaimsAndCurrentMappings(t *testing.T) {
	mappings := []config.GroupMapping{{Claim: "/realm~1groups/names", Value: "engineering", Group: "engineers"}}
	claims, err := selectedClaims(map[string]any{"realm/groups": map[string]any{"names": []any{"engineering", "unknown"}}, "secret": "not retained"}, mappings)
	if err != nil || len(claims) != 1 || claims["secret"] != nil {
		t.Fatalf("bad snapshot %v %v", claims, err)
	}
	for _, bad := range []any{true, 7, map[string]any{}, []any{"ok", 4}, strings.Repeat("x", 257)} {
		if _, e := selectedClaims(map[string]any{"groups": bad}, []config.GroupMapping{{Claim: "/groups"}}); e == nil {
			t.Fatal("invalid mapped claim accepted")
		}
	}
	c := staticConfig()
	c.Auth.Providers = []config.AuthProviderConfig{{ID: "company", Type: "oidc", Enabled: true, Issuer: "https://idp", ClientID: "app", GroupMappings: mappings}}
	r := NewUserResolver(c)
	now := time.Now().Unix()
	e := sessionEvidence{Version: 2, ProviderID: "company", Issuer: "https://idp", Subject: "alice", Revision: r.revision(c.Auth.Providers[0], ""), Claims: claims, IssuedAt: now, ExpiresAt: now + 100}
	i := RequestIdentity{&e}
	actor, f := r.Resolve(i)
	if f != nil || len(actor.Profile.Groups) != 1 {
		t.Fatal("mapping failed")
	}
	c.Auth.Providers[0].GroupMappings[0].Group = "auditors"
	actor, f = r.Resolve(i)
	if f != nil || actor.Profile.Groups[0] != "auditors" {
		t.Fatal("mapping was not reapplied")
	}
	c.Auth.Providers[0].GroupMappings[0].Claim = "/other"
	if _, f = r.Resolve(i); f == nil {
		t.Fatal("new claim schema reused stale evidence")
	}
}
