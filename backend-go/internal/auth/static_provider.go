package auth

import (
	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

type StaticUserAuthProvider struct {
	cfg        *config.CagnardConfig
	users      map[string]config.ConfiguredUser
	providerID string
	enabled    bool
}

func NewStaticUserAuthProvider(cfg *config.CagnardConfig) *StaticUserAuthProvider {
	providerID := "static"
	if cfg.Auth.StaticProvider != nil && cfg.Auth.StaticProvider.ID != nil && *cfg.Auth.StaticProvider.ID != "" {
		providerID = *cfg.Auth.StaticProvider.ID
	}
	enabled := cfg.Auth.ConfiguredUsersEnabled
	if cfg.Auth.StaticProvider != nil && cfg.Auth.StaticProvider.Enabled != nil {
		enabled = enabled && *cfg.Auth.StaticProvider.Enabled
	}
	users := make(map[string]config.ConfiguredUser, len(cfg.Users))
	for _, user := range cfg.Users {
		users[user.ID] = user
	}
	return &StaticUserAuthProvider{cfg: cfg, users: users, providerID: providerID, enabled: enabled}
}

func (p *StaticUserAuthProvider) ProviderID() string {
	return p.providerID
}

func (p *StaticUserAuthProvider) Enabled() bool {
	return p.enabled
}

func (p *StaticUserAuthProvider) Metadata() *ProviderMetadata {
	if !p.enabled {
		return nil
	}
	label := "Cagnard account"
	if p.cfg.Auth.StaticProvider != nil && p.cfg.Auth.StaticProvider.Label != nil && *p.cfg.Auth.StaticProvider.Label != "" {
		label = *p.cfg.Auth.StaticProvider.Label
	}
	loginURL := "/api/auth/login"
	return &ProviderMetadata{
		ID:       p.providerID,
		Label:    label,
		Kind:     "static",
		LoginURL: &loginURL,
		Fields: []ProviderField{
			{Name: "username", Label: "User", Kind: "text", Required: true},
			{Name: "password", Label: "Password", Kind: "password", Required: true},
		},
		Capabilities: []string{"password-login"},
	}
}

func (p *StaticUserAuthProvider) Authenticate(credentials StaticLoginCredentials) (AuthenticatedPrincipal, *Failure) {
	if !p.enabled {
		return AuthenticatedPrincipal{}, p.genericFailure()
	}
	user, ok := p.users[credentials.Username]
	if !ok || user.Credential == nil || !VerifyPassword(credentials.Password, user.Credential.Verifier) {
		return AuthenticatedPrincipal{}, p.genericFailure()
	}
	return AuthenticatedPrincipal{
		ProviderID: p.providerID,
		Subject:    user.ID,
		Profile:    profileFromConfiguredUser(user),
		AuthMode:   "static",
	}, nil
}

func (p *StaticUserAuthProvider) PrincipalForSubject(subject string) (AuthenticatedPrincipal, *Failure) {
	user, ok := p.users[subject]
	if !ok {
		return AuthenticatedPrincipal{}, &Failure{Code: "invalid_session", Message: "Session user is no longer configured"}
	}
	return AuthenticatedPrincipal{
		ProviderID: p.providerID,
		Subject:    user.ID,
		Profile:    profileFromConfiguredUser(user),
		AuthMode:   "static",
	}, nil
}

func (p *StaticUserAuthProvider) genericFailure() *Failure {
	return &Failure{Code: "authentication_failed", Message: "Invalid username or password"}
}

func profileFromConfiguredUser(user config.ConfiguredUser) UserProfile {
	claims := map[string]string{}
	for key, value := range user.Claims {
		claims[key] = value
	}
	return UserProfile{
		ID:          user.ID,
		DisplayName: user.DisplayName,
		Roles:       append([]string{}, user.Roles...),
		Groups:      append([]string{}, user.Groups...),
		Claims:      claims,
	}
}
