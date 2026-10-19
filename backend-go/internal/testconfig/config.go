// Package testconfig contains explicit authentication fixtures for backend tests.
package testconfig

import (
	"github.com/k3rnl/cagnard/backend-go/internal/config"
	"github.com/k3rnl/cagnard/backend-go/internal/identity"
)

const Key = "Y2FnbmFyZC10ZXN0LWtleS0zMi1ieXRlcy0wMDAwMDA="
const Verifier = "pbkdf2-sha256:120000:Y2FnbmFyZC1kZW1vLXN0YXRpYy11c2VyLXNhbHQ:fUdgpOu_Z3MHhgdWzUku12tWnSH5s9BhfjJVv1fiIms"

func Development() config.AuthConfig {
	return config.AuthConfig{Version: 2, PublicURL: "http://localhost:8080", AllowInsecureLoopback: true, Session: config.SessionConfig{Key: Key, TTLSeconds: 3600}, Development: &config.DevelopmentConfig{Enabled: true, DefaultUser: "alice", Users: []config.ConfiguredUser{{ID: "alice", DisplayName: "Alice", Enabled: true, StorageKey: "alice"}, {ID: "bob", DisplayName: "Bob", Enabled: true, StorageKey: "bob"}}}}
}
func GrantAll(cfg *config.CagnardConfig) {
	refs := []config.RootRef{}
	for _, r := range cfg.PersonalStorage {
		refs = append(refs, config.RootRef{Tunnel: "personal", RootID: r.ID})
	}
	for _, r := range cfg.GlobalStorage {
		refs = append(refs, config.RootRef{Tunnel: "global", RootID: r.ID})
	}
	cfg.Authorization = config.AuthorizationConfig{Roles: []config.RoleConfig{{ID: "manager", Actions: append([]string{}, identity.Actions...)}}, Bindings: []config.BindingConfig{{Subjects: []config.SubjectConfig{{Authenticated: true}}, Roles: []string{"manager"}, Roots: refs}}}
}
