package config

type CagnardConfig struct {
	Server          ServerConfig
	Appearance      AppearanceConfig
	Auth            AuthConfig
	Tasks           TaskConfig
	Users           []ConfiguredUser
	Providers       []ProviderConfig
	Accounts        []StorageAccountConfig
	PersonalStorage []StorageRootConfig
	GlobalStorage   []StorageRootConfig
}

type AppearancePalette string

const (
	AppearancePaletteClassic AppearancePalette = "classic"
	AppearancePaletteSolar   AppearancePalette = "solar"
)

type AppearanceMode string

const (
	AppearanceModeLight  AppearanceMode = "light"
	AppearanceModeDark   AppearanceMode = "dark"
	AppearanceModeSystem AppearanceMode = "system"
)

type AppearanceConfig struct {
	DefaultPalette    AppearancePalette
	DefaultMode       AppearanceMode
	AllowUserOverride bool
}

func DefaultAppearanceConfig() AppearanceConfig {
	return AppearanceConfig{
		DefaultPalette:    AppearancePaletteClassic,
		DefaultMode:       AppearanceModeSystem,
		AllowUserOverride: true,
	}
}

func (c CagnardConfig) EffectiveAppearance() AppearanceConfig {
	appearance := c.Appearance
	if appearance.DefaultPalette == "" && appearance.DefaultMode == "" {
		return DefaultAppearanceConfig()
	}
	if appearance.DefaultPalette == "" {
		appearance.DefaultPalette = AppearancePaletteClassic
	}
	if appearance.DefaultMode == "" {
		appearance.DefaultMode = AppearanceModeSystem
	}
	return appearance
}

type ServerConfig struct {
	Host string
	Port int
}

type TaskConfig struct {
	MaxConcurrentTransfers int
	MaxConcurrentItems     int
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

func (c CagnardConfig) AuthMode() string {
	if c.Auth.Mode == nil || *c.Auth.Mode == "" {
		return "development"
	}
	return *c.Auth.Mode
}
