package auth

import (
	"path/filepath"
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

func (s *AccessService) PersonalRoots(user UserProfile) []storage.ResolvedStorageRoot {
	return s.roots("personal", s.cfg.PersonalStorage, user)
}

func (s *AccessService) GlobalRoots(user UserProfile) []storage.ResolvedStorageRoot {
	return s.roots("global", s.cfg.GlobalStorage, user)
}

func (s *AccessService) roots(tunnel string, roots []config.StorageRootConfig, user UserProfile) []storage.ResolvedStorageRoot {
	out := make([]storage.ResolvedStorageRoot, 0, len(roots))
	for _, root := range roots {
		if !isAllowed(root, user) {
			continue
		}
		if resolved, ok := s.resolve(tunnel, root, user); ok {
			out = append(out, resolved)
		}
	}
	return out
}

func (s *AccessService) resolve(tunnel string, root config.StorageRootConfig, user UserProfile) (storage.ResolvedStorageRoot, bool) {
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
	return storage.ResolvedStorageRoot{
		ID:             root.ID,
		Label:          displayLabel(provider.Type, root),
		Tunnel:         tunnel,
		ProviderID:     root.ProviderID,
		AccountID:      root.AccountID,
		ProviderFamily: provider.Family,
		ReadOnly:       account.ReadOnly,
		Target:         target,
		Settings:       root.Settings,
	}, true
}

func isAllowed(root config.StorageRootConfig, user UserProfile) bool {
	hasRules := len(root.AllowedUsers) > 0 || len(root.AllowedRoles) > 0 || len(root.AllowedGroups) > 0
	if !hasRules {
		return true
	}
	return contains(root.AllowedUsers, user.ID) ||
		intersects(user.Roles, root.AllowedRoles) ||
		intersects(user.Groups, root.AllowedGroups)
}

func rootTarget(providerType string, root config.StorageRootConfig, user UserProfile) (storage.RootTarget, bool) {
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
		return storage.ObjectStoreRootTarget{Bucket: bucket, Prefix: normalizePrefix(root.Settings["prefix"])}, true
	case "http":
		return storage.HTTPRootTarget{Prefix: normalizePrefix(root.Settings["prefix"])}, true
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

func interpolate(raw string, user UserProfile) string {
	out := strings.ReplaceAll(raw, "{user.id}", user.ID)
	out = strings.ReplaceAll(out, "{user.name}", user.ID)
	for key, value := range user.Claims {
		out = strings.ReplaceAll(out, "{claim."+key+"}", value)
	}
	return out
}

func contains(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func intersects(left []string, right []string) bool {
	if len(left) == 0 || len(right) == 0 {
		return false
	}
	lookup := map[string]bool{}
	for _, value := range right {
		lookup[value] = true
	}
	for _, value := range left {
		if lookup[value] {
			return true
		}
	}
	return false
}
