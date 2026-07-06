package auth

type RequestIdentity struct {
	ConfiguredUserHeader string
	AuthorizationHeader  string
	Cookies              map[string]string
}

type ProviderMetadata struct {
	ID           string
	Label        string
	Kind         string
	LoginURL     *string
	Fields       []ProviderField
	Capabilities []string
}

type ProviderField struct {
	Name     string
	Label    string
	Kind     string
	Required bool
}

type StaticLoginCredentials struct {
	Username string
	Password string
}

type UserProfile struct {
	ID          string
	DisplayName string
	Roles       []string
	Groups      []string
	Claims      map[string]string
}

type AuthenticatedPrincipal struct {
	ProviderID string
	Subject    string
	Profile    UserProfile
	AuthMode   string
}

type Failure struct {
	Code    string
	Message string
}

type SessionClaims struct {
	ProviderID string `json:"providerId"`
	Subject    string `json:"subject"`
	IssuedAt   int64  `json:"issuedAt"`
	ExpiresAt  int64  `json:"expiresAt"`
}

type ResolvedUser struct {
	Profile  UserProfile
	AuthMode string
}
