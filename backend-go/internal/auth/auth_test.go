package auth

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

func TestPasswordVerifierMatchesStaticUserMaterial(t *testing.T) {
	const verifier = "pbkdf2-sha256:120000:Y2FnbmFyZC1kZW1vLXN0YXRpYy11c2VyLXNhbHQ:fUdgpOu_Z3MHhgdWzUku12tWnSH5s9BhfjJVv1fiIms"
	if !VerifyPassword("cagnard", verifier) {
		t.Fatal("expected demo password to verify")
	}
	if VerifyPassword("wrong", verifier) {
		t.Fatal("expected wrong password to fail")
	}
}

func TestStaticLoginSessionAndAccessFiltering(t *testing.T) {
	cfg := loadFixture(t)
	resolver := NewUserResolver(cfg)
	access := NewAccessService(cfg)

	resolved, token, failure := resolver.LoginStatic("alice", "cagnard")
	if failure != nil {
		t.Fatalf("login failed: %#v", failure)
	}
	if resolved.Profile.ID != "alice" || resolved.AuthMode != "static" {
		t.Fatalf("unexpected resolved user: %#v", resolved)
	}

	sessionResolved, failure := resolver.Resolve(RequestIdentity{Cookies: map[string]string{"CAGNARD_SESSION": token}})
	if failure != nil {
		t.Fatalf("session resolve failed: %#v", failure)
	}
	if sessionResolved.Profile.ID != "alice" {
		t.Fatalf("session user = %q", sessionResolved.Profile.ID)
	}

	personal := access.PersonalRoots(sessionResolved.Profile)
	global := access.GlobalRoots(sessionResolved.Profile)
	if len(personal) != 1 || personal[0].Label != "Home" {
		t.Fatalf("unexpected personal roots: %#v", personal)
	}
	if target, ok := personal[0].Target.(storage.FilesystemRootTarget); !ok || filepath.Base(target.Path) != "alice" {
		t.Fatalf("unexpected filesystem target: %#v", personal[0].Target)
	}
	if len(global) != 1 || global[0].Label != "Global" {
		t.Fatalf("unexpected global roots: %#v", global)
	}
}

func TestSessionRejectsTamperingAndExpiry(t *testing.T) {
	cfg := loadFixture(t)
	now := time.Unix(1000, 0)
	sessions := NewSessionServiceWithClock(cfg, func() time.Time { return now })
	token, err := sessions.Issue(AuthenticatedPrincipal{
		ProviderID: "static",
		Subject:    "alice",
		Profile:    UserProfile{ID: "alice"},
		AuthMode:   "static",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, failure := sessions.Verify(token + "tampered"); failure == nil || failure.Code != "invalid_session" {
		t.Fatalf("expected tampered token rejection, got %#v", failure)
	}

	expired := NewSessionServiceWithClock(cfg, func() time.Time { return now.Add(9 * time.Hour) })
	if _, failure := expired.Verify(token); failure == nil || failure.Code != "session_expired" {
		t.Fatalf("expected expired token rejection, got %#v", failure)
	}
}

func TestAccessResolvesS3BucketLabelsAndPrefixes(t *testing.T) {
	mode := "development"
	defaultUser := "alice"
	label := "Documents"
	cfg := &config.CagnardConfig{
		Auth: config.AuthConfig{Mode: &mode, ConfiguredUsersEnabled: true, DefaultUser: &defaultUser},
		Users: []config.ConfiguredUser{
			{ID: "alice", DisplayName: "Alice", Roles: []string{"user"}},
		},
		Providers: []config.ProviderConfig{
			{ID: "s3-main", Type: "s3", Family: "s3", DisplayName: "S3 compatible", Settings: map[string]string{"region": "us-east-1"}},
		},
		Accounts: []config.StorageAccountConfig{
			{ID: "s3-account", ProviderID: "s3-main", DisplayName: "S3 account", Enabled: true, AuthMode: "static", Settings: map[string]string{"accessKeyId": "test-access", "secretAccessKey": "test-secret"}},
		},
		PersonalStorage: []config.StorageRootConfig{
			{ID: "s3-home", Label: &label, ProviderID: "s3-main", AccountID: "s3-account", Settings: map[string]string{"bucket": "cagnard-test", "prefix": "team/docs"}, AllowedUsers: []string{"alice"}},
			{ID: "bucket-name-root", ProviderID: "s3-main", AccountID: "s3-account", Settings: map[string]string{"bucket": "raw-bucket"}, AllowedUsers: []string{"alice"}},
		},
	}
	roots := NewAccessService(cfg).PersonalRoots(UserProfile{ID: "alice", Roles: []string{"user"}})
	if len(roots) != 2 {
		t.Fatalf("roots = %#v", roots)
	}
	prefixed := roots[0]
	target, ok := prefixed.Target.(storage.ObjectStoreRootTarget)
	if !ok || prefixed.Label != "Documents" || target.Bucket != "cagnard-test" || target.Prefix != "team/docs" {
		t.Fatalf("prefixed root = %#v target = %#v", prefixed, prefixed.Target)
	}
	if roots[1].Label != "raw-bucket" {
		t.Fatalf("bucket label = %q", roots[1].Label)
	}
}

func loadFixture(t *testing.T) *config.CagnardConfig {
	t.Helper()
	cfg, err := config.Load(filepath.Join("..", "..", "..", "config", "cagnard.example.conf"))
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}
