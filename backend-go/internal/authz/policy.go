// Package authz evaluates declared, additive, root-scoped permission bindings.
package authz

import (
	"github.com/k3rnl/cagnard/backend-go/internal/config"
	"github.com/k3rnl/cagnard/backend-go/internal/identity"
	"slices"
)

type Policy struct{ cfg *config.CagnardConfig }

func New(cfg *config.CagnardConfig) *Policy { return &Policy{cfg} }
func (p *Policy) Actions(actor identity.Principal, tunnel, rootID string) []string {
	granted := map[string]bool{}
	if actor.Profile.ID == "" {
		return []string{}
	}
	for _, b := range p.cfg.Authorization.Bindings {
		if !slices.Contains(b.Roots, config.RootRef{Tunnel: tunnel, RootID: rootID}) {
			continue
		}
		match := false
		for _, s := range b.Subjects {
			match = match || s.Authenticated || (s.Group != "" && slices.Contains(actor.Profile.Groups, s.Group)) || (s.ProviderID == actor.Profile.ProviderID && s.Subject == actor.Profile.Subject && s.Subject != "")
		}
		if !match {
			continue
		}
		for _, role := range p.cfg.Authorization.Roles {
			if slices.Contains(b.Roles, role.ID) {
				for _, action := range role.Actions {
					granted[action] = true
				}
			}
		}
	}
	out := []string{}
	for _, action := range identity.Actions {
		if granted[action] {
			out = append(out, action)
		}
	}
	return out
}
