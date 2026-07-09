package config

type CagnardConfig struct {
	Server          ServerConfig
	Auth            AuthConfig
	Tasks           TaskConfig
	Users           []ConfiguredUser
	Providers       []ProviderConfig
	Accounts        []StorageAccountConfig
	PersonalStorage []StorageRootConfig
	GlobalStorage   []StorageRootConfig
	UIPlugins       []UIPluginConfig
}

type ServerConfig struct {
	Host string
	Port int
}

type TaskConfig struct {
	MaxConcurrentTransfers int
}

type AuthConfig struct {
	Mode                   *string
	ConfiguredUsersEnabled bool
	DefaultUser            *string
	Session                *SessionConfig
	StaticProvider         *StaticProviderConfig
	OIDCProviders          []OIDCProviderConfig
}

type SessionConfig struct {
	SigningSecret *string
	TTLSeconds    *int64
	CookieName    *string
	SecureCookies *bool
}

type StaticProviderConfig struct {
	ID      *string
	Label   *string
	Enabled *bool
}

type OIDCProviderConfig struct {
	ID          string
	Issuer      string
	Audience    string
	GroupsClaim string
}

type ConfiguredUser struct {
	ID          string
	DisplayName string
	Roles       []string
	Groups      []string
	Claims      map[string]string
	Credential  *StaticUserCredentialConfig
}

type StaticUserCredentialConfig struct {
	Verifier string
}

type ProviderConfig struct {
	ID          string
	Type        string
	Family      string
	DisplayName string
	Settings    map[string]string
}

type StorageAccountConfig struct {
	ID          string
	ProviderID  string
	DisplayName string
	Enabled     bool
	ReadOnly    bool
	AuthMode    string
	Settings    map[string]string
}

type StorageRootConfig struct {
	ID            string
	Label         *string
	ProviderID    string
	AccountID     string
	Path          *string
	Settings      map[string]string
	AllowedUsers  []string
	AllowedRoles  []string
	AllowedGroups []string
}

type UIPluginConfig struct {
	ID                   string
	Label                string
	Kind                 string
	APIVersion           string
	Enabled              bool
	MIMETypes            []string
	Extensions           []string
	Permissions          []string
	Priority             int
	View                 string
	Categories           []string
	Mode                 string
	EditMode             string
	ReadStrategy         string
	SaveStrategy         string
	MaxSizeBytes         int64
	RequiredCapabilities []string
}

func (c CagnardConfig) AuthMode() string {
	if c.Auth.Mode == nil || *c.Auth.Mode == "" {
		return "development"
	}
	return *c.Auth.Mode
}
