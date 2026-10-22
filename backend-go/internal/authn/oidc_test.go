package authn

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	jose "github.com/go-jose/go-jose/v4"
	"github.com/k3rnl/cagnard/backend-go/internal/config"
	"github.com/k3rnl/cagnard/backend-go/internal/identity"
	"github.com/k3rnl/cagnard/backend-go/internal/storageaccess"
)

type fakeLogin struct {
	nonce, challenge string
	changes          map[string]any
	wrongKey         bool
	algorithm        jose.SignatureAlgorithm
}
type fakeIDP struct {
	server *httptest.Server
	key    *rsa.PrivateKey
	kid    string
	mu     sync.Mutex
	codes  map[string]fakeLogin
	outage bool
}

func newIDP(t *testing.T) *fakeIDP {
	return newIDPWithTLS(t, false)
}

func newIDPWithTLS(t *testing.T, useTLS bool) *fakeIDP {
	t.Helper()
	key, e := rsa.GenerateKey(rand.Reader, 2048)
	if e != nil {
		t.Fatal(e)
	}
	f := &fakeIDP{key: key, kid: "one", codes: map[string]fakeLogin{}}
	f.server = httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if f.outage {
			w.WriteHeader(503)
			return
		}
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			json.NewEncoder(w).Encode(map[string]any{"issuer": f.server.URL, "authorization_endpoint": f.server.URL + "/authorize", "token_endpoint": f.server.URL + "/token", "jwks_uri": f.server.URL + "/keys", "id_token_signing_alg_values_supported": []string{"RS256"}})
		case "/keys":
			json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &f.key.PublicKey, KeyID: f.kid, Algorithm: "RS256", Use: "sig"}}})
		case "/token":
			r.ParseForm()
			login, ok := f.codes[r.Form.Get("code")]
			delete(f.codes, r.Form.Get("code"))
			id, secret, hasBasic := r.BasicAuth()
			if !hasBasic {
				id = r.Form.Get("client_id")
				secret = r.Form.Get("client_secret")
			}
			digest := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
			if !ok || id != "app" || secret != "secret" || base64.RawURLEncoding.EncodeToString(digest[:]) != login.challenge {
				w.WriteHeader(400)
				json.NewEncoder(w).Encode(map[string]string{"error": "invalid_grant"})
				return
			}
			claims := map[string]any{"iss": f.server.URL, "sub": "alice", "aud": "app", "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(), "nonce": login.nonce, "name": "Alice", "groups": []string{"engineering"}}
			for key, value := range login.changes {
				if value == nil {
					delete(claims, key)
				} else {
					claims[key] = value
				}
			}
			key := f.key
			if login.wrongKey {
				key, _ = rsa.GenerateKey(rand.Reader, 2048)
			}
			algorithm := login.algorithm
			if algorithm == "" {
				algorithm = jose.RS256
			}
			signer, err := jose.NewSigner(jose.SigningKey{Algorithm: algorithm, Key: key}, (&jose.SignerOptions{}).WithHeader("kid", f.kid))
			if err != nil {
				w.WriteHeader(500)
				return
			}
			payload, _ := json.Marshal(claims)
			signed, _ := signer.Sign(payload)
			token, _ := signed.CompactSerialize()
			json.NewEncoder(w).Encode(map[string]any{"access_token": "must-not-reach-browser", "refresh_token": "must-not-be-retained", "token_type": "Bearer", "expires_in": 3600, "id_token": token})
		default:
			w.WriteHeader(404)
		}
	}))
	if useTLS {
		f.server.StartTLS()
	} else {
		f.server.Start()
	}
	t.Cleanup(f.server.Close)
	return f
}
func oidcResolver(f *fakeIDP) *UserResolver {
	c := staticConfig()
	c.Auth.Providers = append(c.Auth.Providers, config.AuthProviderConfig{ID: "company", Type: "oidc", Enabled: true, Issuer: f.server.URL, ClientID: "app", ClientSecret: "secret", Scopes: []string{"openid", "profile"}, GroupMappings: []config.GroupMapping{{Claim: "/groups", Value: "engineering", Group: "engineering"}}})
	return NewUserResolver(c)
}
func oidcAttempt(t *testing.T, f *fakeIDP, r *UserResolver, changes map[string]any, wrongKey bool) *http.Request {
	t.Helper()
	target, cookie, e := r.StartOIDC(context.Background(), "company", "/browse?hello=1")
	if e != nil {
		t.Fatal(e)
	}
	u, _ := url.Parse(target)
	q := u.Query()
	if q.Get("code_challenge_method") != "S256" || q.Get("nonce") == "" || q.Get("redirect_uri") != "http://localhost:8080/api/auth/providers/company/callback" {
		t.Fatalf("bad start %s", target)
	}
	code := randomToken()
	f.mu.Lock()
	f.codes[code] = fakeLogin{nonce: q.Get("nonce"), challenge: q.Get("code_challenge"), changes: changes, wrongKey: wrongKey}
	f.mu.Unlock()
	req := httptest.NewRequest("GET", "/api/auth/providers/company/callback?code="+code+"&state="+q.Get("state"), nil)
	parsed := (&http.Response{Header: http.Header{"Set-Cookie": []string{cookie}}}).Cookies()
	req.AddCookie(parsed[0])
	return req
}
func TestOIDCVerifiedFlowAndReplayedCode(t *testing.T) {
	f := newIDP(t)
	r := oidcResolver(f)
	req := oidcAttempt(t, f, r, nil, false)
	token, target, e := r.CompleteOIDC(req, "company")
	if e != nil || target != "/browse?hello=1" {
		t.Fatalf("callback %s %v", target, e)
	}
	claims, failure := r.sessions.Verify(token)
	if failure != nil {
		t.Fatal(failure)
	}
	actor, failure := r.Resolve(RequestIdentity{&claims})
	if failure != nil || actor.Profile.Subject != "alice" || len(actor.Profile.Groups) != 1 {
		t.Fatalf("bad identity %v %v", actor, failure)
	}
	data, _ := json.Marshal(claims)
	if strings.Contains(string(data), "token") || strings.Contains(token, "must-not") {
		t.Fatal("tokens persisted")
	}
	if _, _, e = r.CompleteOIDC(req, "company"); e == nil {
		t.Fatal("code replay accepted")
	}
	// A new kid forces the shared verifier to refresh its cached JWKS.
	newKey, _ := rsa.GenerateKey(rand.Reader, 2048)
	f.mu.Lock()
	f.key = newKey
	f.kid = "two"
	f.mu.Unlock()
	if _, _, e = r.CompleteOIDC(oidcAttempt(t, f, r, nil, false), "company"); e != nil {
		t.Fatalf("key rotation failed: %v", e)
	}
}
func TestOIDCRejectsInvalidIdentity(t *testing.T) {
	f := newIDP(t)
	r := oidcResolver(f)
	cases := []struct {
		name     string
		changes  map[string]any
		wrongKey bool
	}{
		{"signature", nil, true}, {"issuer", map[string]any{"iss": "https://other"}, false}, {"audience", map[string]any{"aud": "other"}, false},
		{"azp", map[string]any{"azp": "other"}, false}, {"multiple-audiences", map[string]any{"aud": []string{"app", "other"}}, false},
		{"nonce", map[string]any{"nonce": "wrong"}, false}, {"missing-subject", map[string]any{"sub": nil}, false}, {"empty-subject", map[string]any{"sub": ""}, false},
		{"expiry", map[string]any{"exp": time.Now().Add(-time.Hour).Unix()}, false}, {"claim-type", map[string]any{"groups": []any{"engineering", true}}, false},
		{"oversize", map[string]any{"groups": []string{strings.Repeat("x", 257)}}, false},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			req := oidcAttempt(t, f, r, test.changes, test.wrongKey)
			if token, _, e := r.CompleteOIDC(req, "company"); e == nil || token != "" {
				t.Fatal("invalid identity authenticated")
			}
		})
	}
	req := oidcAttempt(t, f, r, nil, false)
	f.mu.Lock()
	code := req.URL.Query().Get("code")
	login := f.codes[code]
	login.algorithm = jose.RS512
	f.codes[code] = login
	f.mu.Unlock()
	if _, _, e := r.CompleteOIDC(req, "company"); e == nil {
		t.Fatal("unapproved algorithm accepted")
	}
}
func TestOIDCTransactionsAndOutage(t *testing.T) {
	f := newIDP(t)
	r := oidcResolver(f)
	first := oidcAttempt(t, f, r, nil, false)
	second := oidcAttempt(t, f, r, nil, false)
	first.Header.Set("Cookie", second.Header.Get("Cookie"))
	if _, _, e := r.CompleteOIDC(first, "company"); e == nil {
		t.Fatal("superseded state accepted")
	}
	req := oidcAttempt(t, f, r, nil, false)
	req.URL.RawQuery += "&error=access_denied"
	if _, _, e := r.CompleteOIDC(req, "company"); e == nil {
		t.Fatal("denied consent accepted")
	}
	req = oidcAttempt(t, f, r, nil, false)
	r.clock = func() time.Time { return time.Now().Add(6 * time.Minute) }
	if _, _, e := r.CompleteOIDC(req, "company"); e == nil {
		t.Fatal("expired transaction accepted")
	}
	r.clock = time.Now
	for _, path := range []string{"https://evil.test", "//evil.test", "/\\evil", "/%2f%2fevil", "/%5cevil", "/api/auth/logout"} {
		if SafeReturnPath(path) {
			t.Fatalf("unsafe redirect %q", path)
		}
	}
	f.mu.Lock()
	f.outage = true
	f.mu.Unlock()
	fresh := oidcResolver(f)
	if _, _, e := fresh.StartOIDC(context.Background(), "company", "/"); e == nil {
		t.Fatal("outage not reported")
	}
	if _, _, failure := fresh.LoginStatic("local", "alice", "cagnard"); failure != nil {
		t.Fatal("OIDC outage broke static login")
	}
}

func TestClaimPointers(t *testing.T) {
	claims := map[string]any{"roles": []any{map[string]any{"a/b~c": []any{"engineering"}}}}
	got := claimAt(claims, "/roles/0/a~1b~0c")
	values, ok := got.([]any)
	if !ok || len(values) != 1 || values[0] != "engineering" {
		t.Fatalf("pointer resolution: %#v", got)
	}
	for _, pointer := range []string{"/roles/-1", "/roles/01", "/roles/2", "/roles/-"} {
		if claimAt(claims, pointer) != nil {
			t.Fatalf("invalid array selector resolved: %s", pointer)
		}
	}
}

func TestStaticAndOIDCShareEffectivePolicy(t *testing.T) {
	f := newIDP(t)
	r := oidcResolver(f)
	c := r.cfg
	rootPath := t.TempDir()
	c.Providers = []config.ProviderConfig{{ID: "fs", Type: "filesystem"}}
	c.Accounts = []config.StorageAccountConfig{{ID: "writable", ProviderID: "fs", Enabled: true}, {ID: "readonly", ProviderID: "fs", Enabled: true, ReadOnly: true}}
	c.GlobalStorage = []config.StorageRootConfig{{ID: "source", ProviderID: "fs", AccountID: "writable", Path: &rootPath}, {ID: "destination", ProviderID: "fs", AccountID: "writable", Path: &rootPath}, {ID: "archive", ProviderID: "fs", AccountID: "readonly", Path: &rootPath}}
	c.Authorization = config.AuthorizationConfig{
		Roles: []config.RoleConfig{{ID: "reader", Actions: []string{identity.List, identity.Read}}, {ID: "manager", Actions: identity.Actions}},
		Bindings: []config.BindingConfig{
			{Subjects: []config.SubjectConfig{{Group: "engineering"}}, Roles: []string{"reader"}, Roots: []config.RootRef{{Tunnel: "global", RootID: "source"}}},
			{Subjects: []config.SubjectConfig{{Group: "engineering"}}, Roles: []string{"manager"}, Roots: []config.RootRef{{Tunnel: "global", RootID: "destination"}, {Tunnel: "global", RootID: "archive"}}},
		},
	}
	local, _, failure := r.LoginStatic("local", "alice", "cagnard")
	if failure != nil {
		t.Fatal(failure)
	}
	token, _, err := r.CompleteOIDC(oidcAttempt(t, f, r, nil, false), "company")
	if err != nil {
		t.Fatal(err)
	}
	evidence, failure := r.sessions.Verify(token)
	if failure != nil {
		t.Fatal(failure)
	}
	external, failure := r.Resolve(RequestIdentity{&evidence})
	if failure != nil {
		t.Fatal(failure)
	}
	if local.Profile.ID == external.Profile.ID || local.StorageKey == external.StorageKey {
		t.Fatal("different identities were linked")
	}
	access := storageaccess.NewAccessService(c)
	for _, actor := range []identity.Principal{local, external} {
		for _, test := range []struct {
			root    string
			actions []string
		}{{"source", []string{identity.List, identity.Read}}, {"destination", identity.Actions}, {"archive", []string{identity.List, identity.Read}}} {
			root, ok := access.Root(actor, "global", test.root)
			if !ok || !slices.Equal(root.Actions, test.actions) {
				t.Fatalf("%s root %s: %v", actor.Profile.ProviderID, test.root, root.Actions)
			}
		}
	}
}
