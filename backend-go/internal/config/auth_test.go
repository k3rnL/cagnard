package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAuthConfigurationRejectsAmbiguity(t *testing.T) {
	original, err := os.ReadFile(filepath.Join("..", "..", "..", "config", "cagnard.example.conf"))
	if err != nil {
		t.Fatal(err)
	}
	for _, change := range []struct{ name, from, to string }{
		{"legacy", "version = 2", "version = 2\nmode = static"},
		{"unknown-auth-field", "version = 2", "version = 2\nunknown = true"},
		{"static-tls-bypass", "type = static", "type = static\ntrustAllCertificates = true"},
		{"invalid-tls-bypass-type", "type = static", "type = static\ntrustAllCertificates = \"yes\""},
		{"bad-key", "Y2FnbmFyZC10ZXN0LWtleS0zMi1ieXRlcy0wMDAwMDA=", "weak"},
		{"unknown-group", "groups = [engineering]", "groups = [missing]"},
		{"unknown-role", "roles = [manager]", "roles = [missing]"},
		{"unknown-action", "storage.rename", "storage.admin"},
		{"unknown-root", "rootId = home", "rootId = missing"},
		{"unsafe-home", "storageKey = alice", "storageKey = \"../bob\""},
		{"reserved-home", "storageKey = alice", "storageKey = p-abc"},
		{"legacy-template", "{principal.storageKey}", "{claim.sub}"},
		{"mixed-subject", "{ group = engineering }", "{ group = engineering, authenticated = true }"},
		{"unsafe-provider", "id = static", "id = \"bad id\""},
	} {
		t.Run(change.name, func(t *testing.T) {
			s := strings.Replace(string(original), change.from, change.to, 1)
			if s == string(original) {
				t.Fatal("fixture did not change")
			}
			path := filepath.Join(t.TempDir(), "bad.conf")
			os.WriteFile(path, []byte(s), 0600)
			if _, err := Load(path); err == nil {
				t.Fatal("invalid configuration accepted")
			}
		})
	}
	for _, body := range []string{"{}", "auth {mode = external}", "users = []"} {
		path := filepath.Join(t.TempDir(), "missing.conf")
		os.WriteFile(path, []byte(body), 0600)
		if _, err := Load(path); err == nil {
			t.Fatal("implicit mode accepted")
		}
	}
}

func TestOIDCTLSConfiguration(t *testing.T) {
	original, err := os.ReadFile(filepath.Join("..", "..", "..", "examples", "run", "oidc-keycloak", "cagnard.conf"))
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{"", "trustAllCertificates = false", "trustAllCertificates = true"} {
		body := strings.Replace(string(original), "type = oidc", "type = oidc\n"+value, 1)
		path := filepath.Join(t.TempDir(), "oidc.conf")
		if err := os.WriteFile(path, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
		cfg, err := Load(path)
		if err != nil {
			t.Fatal(err)
		}
		if cfg.Auth.Providers[1].TrustAllCertificates != (value == "trustAllCertificates = true") {
			t.Fatalf("incorrect TLS opt-in for %q", value)
		}
	}
}
func TestSafeKeyAndDuplicateAssignments(t *testing.T) {
	c := loadFixture(t, "config/cagnard.example.conf")
	c.Auth.Providers[0].Users = append(c.Auth.Providers[0].Users, ConfiguredUser{ID: "bob", Enabled: false, StorageKey: "alice"})
	if len(authConfigurationErrors(c)) == 0 {
		t.Fatal("conflicting home assignment accepted")
	}
	c = loadFixture(t, "config/cagnard.example.conf")
	c.Auth.Development = &DevelopmentConfig{Enabled: true}
	if len(authConfigurationErrors(c)) == 0 {
		t.Fatal("mixed development accepted")
	}
}

func TestFullOIDCExamplesLoad(t *testing.T) {
	t.Setenv("CAGNARD_SESSION_KEY", "Y2FnbmFyZC10ZXN0LWtleS0zMi1ieXRlcy0wMDAwMDA=")
	verifier := "pbkdf2-sha256:120000:Y2FnbmFyZC1kZW1vLXN0YXRpYy11c2VyLXNhbHQ:fUdgpOu_Z3MHhgdWzUku12tWnSH5s9BhfjJVv1fiIms"
	t.Setenv("CAGNARD_ALICE_PASSWORD_VERIFIER", verifier)
	t.Setenv("CAGNARD_RECOVERY_PASSWORD_VERIFIER", verifier)
	t.Setenv("CAGNARD_OIDC_CLIENT_SECRET", "test-client-secret")
	for _, file := range []string{"config/cagnard.oidc.example.conf", "examples/run/oidc-keycloak/cagnard.conf"} {
		c := loadFixture(t, file)
		if len(c.Auth.Providers) != 2 || c.Auth.Providers[1].Type != "oidc" || len(c.Authorization.Bindings) == 0 {
			t.Fatalf("incomplete example %s", file)
		}
	}
}
func TestDevelopmentMustBindLoopback(t *testing.T) {
	path := writeConfigFixture(t, `server.host = "0.0.0.0"`)
	if _, err := Load(path); err == nil {
		t.Fatal("public development listener accepted")
	}
}
