// Package storageaccess combines policy grants with configured storage ceilings.
package storageaccess

import (
	"github.com/k3rnl/cagnard/backend-go/internal/authz"
	"github.com/k3rnl/cagnard/backend-go/internal/identity"
	"path/filepath"
	"slices"
	"strings"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

type AccessService struct {
	cfg       *config.CagnardConfig
	accounts  map[string]config.StorageAccountConfig
	providers map[string]config.ProviderConfig
}

func NewAccessService(cfg *config.CagnardConfig) *AccessService {
	accounts := make(map[string]config.StorageAccountConfig, len(cfg.Accounts))
	providers := make(map[string]config.ProviderConfig, len(cfg.Providers))
	for _, account := range cfg.Accounts {
		accounts[account.ID] = account
	}
	for _, provider := range cfg.Providers {
		providers[provider.ID] = provider
	}
	return &AccessService{cfg: cfg, accounts: accounts, providers: providers}
}

func (s *AccessService) PersonalRoots(user identity.Principal) []storage.ResolvedStorageRoot {
	return s.roots("personal", s.cfg.PersonalStorage, user)
}

func (s *AccessService) GlobalRoots(user identity.Principal) []storage.ResolvedStorageRoot {
	return s.roots("global", s.cfg.GlobalStorage, user)
}

func (s *AccessService) roots(tunnel string, roots []config.StorageRootConfig, user identity.Principal) []storage.ResolvedStorageRoot {
	out := make([]storage.ResolvedStorageRoot, 0, len(roots))
	for _, root := range roots {
		if len(authz.New(s.cfg).Actions(user, tunnel, root.ID)) == 0 {
			continue
		}
		if resolved, ok := s.resolve(tunnel, root, user); ok {
			out = append(out, resolved)
		}
	}
	return out
}

func (s *AccessService) resolve(tunnel string, root config.StorageRootConfig, user identity.Principal) (storage.ResolvedStorageRoot, bool) {
	account, ok := s.accounts[root.AccountID]
	if !ok || !account.Enabled {
		return storage.ResolvedStorageRoot{}, false
	}
	provider, ok := s.providers[root.ProviderID]
	if !ok {
		return storage.ResolvedStorageRoot{}, false
	}
	target, ok := rootTarget(provider.Type, root, user)
	if !ok {
		return storage.ResolvedStorageRoot{}, false
	}
	actions := authz.New(s.cfg).Actions(user, tunnel, root.ID)
	if account.ReadOnly || provider.Type == "http" {
		actions = slices.DeleteFunc(actions, identity.Mutating)
	}
	if len(actions) == 0 {
		return storage.ResolvedStorageRoot{}, false
	}
	writable := false
	for _, a := range actions {
		writable = writable || identity.Mutating(a)
	}
	return storage.ResolvedStorageRoot{
		Actions:        actions,
		ID:             root.ID,
		Label:          displayLabel(provider.Type, root),
		Tunnel:         tunnel,
		ProviderID:     root.ProviderID,
		AccountID:      root.AccountID,
		ProviderFamily: provider.Family,
		ReadOnly:       account.ReadOnly || !writable,
		Target:         target,
		Settings:       root.Settings,
	}, true
}

func rootTarget(providerType string, root config.StorageRootConfig, user identity.Principal) (storage.RootTarget, bool) {
	switch providerType {
	case "filesystem":
		if root.Path == nil {
			return nil, false
		}
		return storage.FilesystemRootTarget{Path: filepath.Clean(interpolate(*root.Path, user))}, true
	case "s3":
		bucket := strings.TrimSpace(root.Settings["bucket"])
		if bucket == "" {
			return nil, false
		}
		return storage.ObjectStoreRootTarget{Bucket: bucket, Prefix: normalizePrefix(interpolate(root.Settings["prefix"], user))}, true
	case "http":
		return storage.HTTPRootTarget{Prefix: normalizePrefix(interpolate(root.Settings["prefix"], user))}, true
	default:
		return nil, false
	}
}

func displayLabel(providerType string, root config.StorageRootConfig) string {
	if root.Label != nil {
		if label := strings.TrimSpace(*root.Label); label != "" {
			return label
		}
	}
	if providerType == "s3" {
		if bucket := strings.TrimSpace(root.Settings["bucket"]); bucket != "" {
			return bucket
		}
	}
	return root.ID
}

func normalizePrefix(raw string) string {
	parts := strings.Split(raw, "/")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part != "" {
			out = append(out, part)
		}
	}
	return strings.Join(out, "/")
}

func interpolate(raw string, user identity.Principal) string {
	return strings.ReplaceAll(raw, "{principal.storageKey}", user.StorageKey)
}

func (s *AccessService) Root(user identity.Principal, tunnel, id string) (storage.ResolvedStorageRoot, bool) {
	var roots []storage.ResolvedStorageRoot
	switch tunnel {
	case "personal":
		roots = s.PersonalRoots(user)
	case "global":
		roots = s.GlobalRoots(user)
	}
	for _, root := range roots {
		if root.ID == id {
			return root, true
		}
	}
	return storage.ResolvedStorageRoot{}, false
}
