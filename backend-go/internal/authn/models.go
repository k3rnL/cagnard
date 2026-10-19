// Package authn authenticates configured login providers and issues bounded local sessions.
// It does not grant storage permissions; those belong to authz.
package authn

import (
	"context"
	"github.com/k3rnl/cagnard/backend-go/internal/identity"
	"time"
)

type ResolvedUser = identity.Principal
type UserProfile = identity.Profile

type Failure struct{ Code, Message string }

func invalidSession() *Failure { return &Failure{"invalid_session", "Authentication is required"} }

type ProviderMetadata struct {
	ID, Label, Kind string
	LoginURL        *string
	Fields          []ProviderField
	Capabilities    []string
}
type ProviderField struct {
	Name, Label, Kind string
	Required          bool
}

// RequestIdentity contains verified, bounded evidence, never cookies or provider tokens.
// Only this package can construct evidence. Resolve rechecks expiry and current config.
type RequestIdentity struct{ evidence *sessionEvidence }

func (i RequestIdentity) DeadlineContext(parent context.Context) (context.Context, context.CancelFunc) {
	if i.evidence == nil {
		ctx, cancel := context.WithCancel(parent)
		cancel()
		return ctx, cancel
	}
	return context.WithDeadline(parent, time.Unix(i.evidence.ExpiresAt, 0))
}

type contextKey struct{}

func IdentityFromContext(ctx context.Context) RequestIdentity {
	i, _ := ctx.Value(contextKey{}).(RequestIdentity)
	return i
}
func WithIdentity(ctx context.Context, i RequestIdentity) context.Context {
	return context.WithValue(ctx, contextKey{}, i)
}

type sessionEvidence struct {
	Version     int                 `json:"v"`
	ProviderID  string              `json:"p"`
	Issuer      string              `json:"iss,omitempty"`
	Subject     string              `json:"s"`
	DisplayName string              `json:"n,omitempty"`
	Revision    string              `json:"r"`
	Claims      map[string][]string `json:"c,omitempty"`
	IssuedAt    int64               `json:"iat"`
	ExpiresAt   int64               `json:"exp"`
}
