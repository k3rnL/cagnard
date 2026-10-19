package storageaccess

import (
	"github.com/k3rnl/cagnard/backend-go/internal/config"
	"github.com/k3rnl/cagnard/backend-go/internal/identity"
	"github.com/k3rnl/cagnard/backend-go/internal/storage"
	"github.com/k3rnl/cagnard/backend-go/internal/testconfig"
	"path/filepath"
	"testing"
)

func TestStorageKeyTargetsAndCeilings(t *testing.T) {
	path := filepath.Join(t.TempDir(), "{principal.storageKey}")
	c := &config.CagnardConfig{Providers: []config.ProviderConfig{{ID: "fs", Type: "filesystem"}, {ID: "s3", Type: "s3"}}, Accounts: []config.StorageAccountConfig{{ID: "fs", ProviderID: "fs", Enabled: true}, {ID: "s3", ProviderID: "s3", Enabled: true, ReadOnly: true}}, PersonalStorage: []config.StorageRootConfig{{ID: "home", ProviderID: "fs", AccountID: "fs", Path: &path}, {ID: "objects", ProviderID: "s3", AccountID: "s3", Settings: map[string]string{"bucket": "test", "prefix": "homes/{principal.storageKey}"}}}}
	testconfig.GrantAll(c)
	access := NewAccessService(c)
	actor := identity.Principal{Profile: identity.Profile{ID: identity.ID("local", "", "alice"), ProviderID: "local", Subject: "alice"}, StorageKey: "alice"}
	roots := access.PersonalRoots(actor)
	if len(roots) != 2 {
		t.Fatal("missing roots")
	}
	if roots[0].Target.(storage.FilesystemRootTarget).Path != filepath.Join(filepath.Dir(path), "alice") || roots[1].Target.(storage.ObjectStoreRootTarget).Prefix != "homes/alice" {
		t.Fatal("target interpolation differs")
	}
	if len(roots[1].Actions) != 2 || !roots[1].ReadOnly {
		t.Fatal("read-only account granted mutations")
	}
	c.Authorization.Bindings = nil
	if len(access.PersonalRoots(actor)) != 0 {
		t.Fatal("default allow remains")
	}
}
