package storage

import (
	"fmt"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

type Registry struct {
	providers map[string]StorageProvider
}

func NewRegistry(cfg *config.CagnardConfig) *Registry {
	providers := map[string]StorageProvider{}
	for _, provider := range cfg.Providers {
		switch provider.Type {
		case "filesystem":
			providers[provider.ID] = NewFilesystemProvider(provider)
		case "s3":
			s3Provider, err := NewS3StorageProviderFromConfig(provider, accountsForProvider(cfg.Accounts, provider.ID))
			if err == nil {
				providers[provider.ID] = s3Provider
			}
		case "http":
			httpProvider, err := NewHTTPStorageProviderFromConfig(provider)
			if err == nil {
				providers[provider.ID] = httpProvider
			}
		}
	}
	return &Registry{providers: providers}
}

func (r *Registry) Provider(id string) (StorageProvider, error) {
	provider, ok := r.providers[id]
	if !ok {
		return nil, fmt.Errorf("Provider '%s' is not registered", id)
	}
	return provider, nil
}

func (r *Registry) NavigationRoot(root ResolvedStorageRoot) ([]CapabilityStatus, error) {
	provider, err := r.Provider(root.ProviderID)
	if err != nil {
		return GenericCapabilities(providerType(root), root.ReadOnly), nil
	}
	return provider.Capabilities(root), nil
}

func providerType(root ResolvedStorageRoot) string {
	switch root.Target.(type) {
	case FilesystemRootTarget:
		return "filesystem"
	case ObjectStoreRootTarget:
		return "s3"
	case HTTPRootTarget:
		return "http"
	default:
		return ""
	}
}

func accountsForProvider(accounts []config.StorageAccountConfig, providerID string) []config.StorageAccountConfig {
	out := make([]config.StorageAccountConfig, 0)
	for _, account := range accounts {
		if account.ProviderID == providerID {
			out = append(out, account)
		}
	}
	return out
}
