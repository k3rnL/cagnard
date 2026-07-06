package auth

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

type UserResolver struct {
	cfg            *config.CagnardConfig
	configured     map[string]config.ConfiguredUser
	staticProvider *StaticUserAuthProvider
	sessions       *SessionService
	authMode       string
}

func NewUserResolver(cfg *config.CagnardConfig) *UserResolver {
	configured := make(map[string]config.ConfiguredUser, len(cfg.Users))
	for _, user := range cfg.Users {
		configured[user.ID] = user
	}
	return &UserResolver{
		cfg:            cfg,
		configured:     configured,
		staticProvider: NewStaticUserAuthProvider(cfg),
		sessions:       NewSessionService(cfg),
		authMode:       cfg.AuthMode(),
	}
}

func (r *UserResolver) Providers() []ProviderMetadata {
	switch r.authMode {
	case "static":
		if metadata := r.staticProvider.Metadata(); metadata != nil {
			return []ProviderMetadata{*metadata}
		}
	}
	return []ProviderMetadata{}
}

func (r *UserResolver) LoginStatic(username string, password string) (ResolvedUser, string, *Failure) {
	if r.authMode != "static" {
		return ResolvedUser{}, "", &Failure{Code: "authentication_disabled", Message: "Static login is not enabled"}
	}
	principal, failure := r.staticProvider.Authenticate(StaticLoginCredentials{Username: username, Password: password})
	if failure != nil {
		return ResolvedUser{}, "", failure
	}
	token, err := r.sessions.Issue(principal)
	if err != nil {
		return ResolvedUser{}, "", &Failure{Code: "invalid_session", Message: "Session payload is invalid"}
	}
	return ResolvedUser{Profile: principal.Profile, AuthMode: principal.AuthMode}, token, nil
}

func (r *UserResolver) Resolve(identity RequestIdentity) (ResolvedUser, *Failure) {
	switch r.authMode {
	case "static":
		return r.resolveSession(identity)
	case "development":
		return r.resolveDevelopment(identity)
	case "external":
		if resolved, ok := r.resolveBearer(identity.AuthorizationHeader); ok {
			return resolved, nil
		}
		return ResolvedUser{}, &Failure{Code: "unauthorized", Message: "No bearer identity resolved"}
	default:
		return ResolvedUser{}, &Failure{Code: "invalid_auth_mode", Message: fmt.Sprintf("Unsupported auth mode '%s'", r.authMode)}
	}
}

func (r *UserResolver) SessionCookie(token string) string {
	return r.sessions.Cookie(token)
}

func (r *UserResolver) ClearSessionCookie() string {
	return r.sessions.ClearCookie()
}

func (r *UserResolver) resolveSession(identity RequestIdentity) (ResolvedUser, *Failure) {
	token := bearerToken(identity.AuthorizationHeader)
	if token == "" {
		token = identity.Cookies[r.sessions.CookieName()]
	}
	if token == "" {
		return ResolvedUser{}, &Failure{Code: "unauthorized", Message: "Authentication is required"}
	}

	claims, failure := r.sessions.Verify(token)
	if failure != nil {
		return ResolvedUser{}, failure
	}
	if claims.ProviderID != r.staticProvider.ProviderID() {
		return ResolvedUser{}, &Failure{Code: "invalid_session", Message: "Session provider is not enabled"}
	}
	principal, failure := r.staticProvider.PrincipalForSubject(claims.Subject)
	if failure != nil {
		return ResolvedUser{}, failure
	}
	return ResolvedUser{Profile: principal.Profile, AuthMode: principal.AuthMode}, nil
}

func (r *UserResolver) resolveDevelopment(identity RequestIdentity) (ResolvedUser, *Failure) {
	if userID := strings.TrimSpace(identity.ConfiguredUserHeader); userID != "" {
		return r.resolveConfigured(userID)
	}
	if resolved, ok := r.resolveBearer(identity.AuthorizationHeader); ok {
		return resolved, nil
	}
	if r.cfg.Auth.DefaultUser != nil {
		if userID := strings.TrimSpace(*r.cfg.Auth.DefaultUser); userID != "" {
			return r.resolveConfigured(userID)
		}
	}
	return ResolvedUser{}, &Failure{Code: "unauthorized", Message: "No configured user or bearer identity resolved"}
}

func (r *UserResolver) resolveConfigured(userID string) (ResolvedUser, *Failure) {
	if !r.cfg.Auth.ConfiguredUsersEnabled {
		return ResolvedUser{}, &Failure{Code: "configured_users_disabled", Message: "Configured users are disabled"}
	}
	user, ok := r.configured[userID]
	if !ok {
		return ResolvedUser{}, &Failure{Code: "unknown_user", Message: fmt.Sprintf("Configured user '%s' was not found", userID)}
	}
	return ResolvedUser{Profile: profileFromConfiguredUser(user), AuthMode: "configured-user"}, nil
}

func (r *UserResolver) resolveBearer(header string) (ResolvedUser, bool) {
	token := bearerToken(header)
	if token == "" {
		return ResolvedUser{}, false
	}
	resolved, failure := r.parseJWTClaims(token)
	if failure != nil {
		return ResolvedUser{}, true
	}
	return resolved, true
}

func (r *UserResolver) parseJWTClaims(token string) (ResolvedUser, *Failure) {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return ResolvedUser{}, &Failure{Code: "invalid_token", Message: "Bearer token does not look like a JWT"}
	}
	payload, err := decodeURLBase64(parts[1])
	if err != nil {
		return ResolvedUser{}, &Failure{Code: "invalid_token", Message: "Bearer token payload is not valid JSON"}
	}
	var claims map[string]any
	if err := json.Unmarshal(payload, &claims); err != nil {
		return ResolvedUser{}, &Failure{Code: "invalid_token", Message: "Bearer token payload is not valid JSON"}
	}
	issuer, _ := claims["iss"].(string)
	if !r.hasTrustedIssuer(issuer) {
		return ResolvedUser{}, &Failure{Code: "untrusted_issuer", Message: fmt.Sprintf("Bearer token issuer '%s' is not configured", issuer)}
	}
	id, _ := claims["sub"].(string)
	if id == "" {
		id = "external-user"
	}
	displayName, _ := claims["name"].(string)
	if displayName == "" {
		displayName = id
	}
	return ResolvedUser{
		Profile: UserProfile{
			ID:          id,
			DisplayName: displayName,
			Roles:       stringArrayClaim(claims["roles"]),
			Groups:      stringArrayClaim(claims["groups"]),
			Claims:      stringClaims(claims),
		},
		AuthMode: "oidc-placeholder",
	}, nil
}

func (r *UserResolver) hasTrustedIssuer(issuer string) bool {
	for _, provider := range r.cfg.Auth.OIDCProviders {
		if provider.Issuer == issuer {
			return true
		}
	}
	return false
}

func bearerToken(header string) string {
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}

func stringArrayClaim(raw any) []string {
	values, ok := raw.([]any)
	if !ok {
		return []string{}
	}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if text, ok := value.(string); ok {
			out = append(out, text)
		}
	}
	return out
}

func stringClaims(raw map[string]any) map[string]string {
	out := map[string]string{}
	for key, value := range raw {
		if text, ok := value.(string); ok {
			out[key] = text
		}
	}
	return out
}
