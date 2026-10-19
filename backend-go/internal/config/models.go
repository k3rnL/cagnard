package config

type CagnardConfig struct {
	Server          ServerConfig
	Appearance      AppearanceConfig
	Auth            AuthConfig
	Tasks           TaskConfig
	StructuredData  StructuredDataConfig
	Authorization   AuthorizationConfig
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

type StructuredDataConfig struct {
	Relational StructuredRelationalConfig
	SQL        StructuredSQLConfig
	Worker     StructuredWorkerConfig
	Iceberg    StructuredIcebergConfig
	NetCDF     StructuredNetCDFConfig
	Exports    StructuredExportConfig
	// DirectContentFullReads makes browser query engines read direct-content
	// files whole instead of probing sizes and ranges; required when the
	// public origin compresses responses or rejects ranged HEAD requests.
	DirectContentFullReads bool
}

type StructuredRelationalConfig struct {
	MaxIngestionBytes int64
	MaxIngestionRows  int64
}

type StructuredSQLConfig struct {
	TimeoutMilliseconds int64
	MaxResultRows       int64
	MaxQueryCharacters  int64
}

type StructuredWorkerConfig struct {
	MaxResponseBytes int64
}

type StructuredIcebergConfig struct {
	MaxMetadataBytes int64
	MaxProbeEntries  int64
}

type StructuredNetCDFConfig struct {
	MaxSourceBytes    int64
	MaxSliceCells     int64
	MaxSliceBytes     int64
	MaxProjectionRows int64
	MaxPlotCells      int64
}

type StructuredExportConfig struct {
	MaxRows  int64
	MaxBytes int64
}

func DefaultStructuredDataConfig() StructuredDataConfig {
	return StructuredDataConfig{
		Relational: StructuredRelationalConfig{
			MaxIngestionBytes: 64 * 1024 * 1024,
			MaxIngestionRows:  200_000,
		},
		SQL: StructuredSQLConfig{
			TimeoutMilliseconds: 30_000,
			MaxResultRows:       100_000,
			MaxQueryCharacters:  100_000,
		},
		Worker: StructuredWorkerConfig{MaxResponseBytes: 16 * 1024 * 1024},
		Iceberg: StructuredIcebergConfig{
			MaxMetadataBytes: 2 * 1024 * 1024,
			MaxProbeEntries:  10_000,
		},
		NetCDF: StructuredNetCDFConfig{
			MaxSourceBytes:    128 * 1024 * 1024,
			MaxSliceCells:     100_000,
			MaxSliceBytes:     16 * 1024 * 1024,
			MaxProjectionRows: 100_000,
			MaxPlotCells:      20_000,
		},
		Exports: StructuredExportConfig{
			MaxRows:  100_000,
			MaxBytes: 16 * 1024 * 1024,
		},
	}
}

func (c CagnardConfig) EffectiveStructuredData() StructuredDataConfig {
	defaults := DefaultStructuredDataConfig()
	configured := c.StructuredData
	fillInt64(&configured.Relational.MaxIngestionBytes, defaults.Relational.MaxIngestionBytes)
	fillInt64(&configured.Relational.MaxIngestionRows, defaults.Relational.MaxIngestionRows)
	fillInt64(&configured.SQL.TimeoutMilliseconds, defaults.SQL.TimeoutMilliseconds)
	fillInt64(&configured.SQL.MaxResultRows, defaults.SQL.MaxResultRows)
	fillInt64(&configured.SQL.MaxQueryCharacters, defaults.SQL.MaxQueryCharacters)
	fillInt64(&configured.Worker.MaxResponseBytes, defaults.Worker.MaxResponseBytes)
	fillInt64(&configured.Iceberg.MaxMetadataBytes, defaults.Iceberg.MaxMetadataBytes)
	fillInt64(&configured.Iceberg.MaxProbeEntries, defaults.Iceberg.MaxProbeEntries)
	fillInt64(&configured.NetCDF.MaxSourceBytes, defaults.NetCDF.MaxSourceBytes)
	fillInt64(&configured.NetCDF.MaxSliceCells, defaults.NetCDF.MaxSliceCells)
	fillInt64(&configured.NetCDF.MaxSliceBytes, defaults.NetCDF.MaxSliceBytes)
	fillInt64(&configured.NetCDF.MaxProjectionRows, defaults.NetCDF.MaxProjectionRows)
	fillInt64(&configured.NetCDF.MaxPlotCells, defaults.NetCDF.MaxPlotCells)
	fillInt64(&configured.Exports.MaxRows, defaults.Exports.MaxRows)
	fillInt64(&configured.Exports.MaxBytes, defaults.Exports.MaxBytes)
	return configured
}

func fillInt64(value *int64, fallback int64) {
	if *value == 0 {
		*value = fallback
	}
}

// AuthConfig declares login providers and browser-session policy. See docs/reference/authentication.md.
type AuthConfig struct {
	Version               int                  `json:"version"`
	PublicURL             string               `json:"publicUrl"`
	AllowInsecureLoopback bool                 `json:"allowInsecureLoopback"`
	Session               SessionConfig        `json:"session"`
	Providers             []AuthProviderConfig `json:"providers"`
	Development           *DevelopmentConfig   `json:"development"`
}

type SessionConfig struct {
	Key           string `json:"key"`
	TTLSeconds    int64  `json:"ttlSeconds"`
	SecureCookies bool   `json:"secureCookies"`
}

type AuthProviderConfig struct {
	ID            string              `json:"id"`
	Type          string              `json:"type"`
	Label         string              `json:"label"`
	Enabled       bool                `json:"enabled"`
	Users         []ConfiguredUser    `json:"users,omitempty"`
	Issuer        string              `json:"issuer,omitempty"`
	ClientID      string              `json:"clientId,omitempty"`
	ClientSecret  string              `json:"clientSecret,omitempty"`
	Scopes        []string            `json:"scopes,omitempty"`
	GroupMappings []GroupMapping      `json:"groupMappings,omitempty"`
	StorageKeys   []StorageKeyMapping `json:"storageKeys,omitempty"`
}

type GroupMapping struct {
	Claim string `json:"claim"`
	Value string `json:"value"`
	Group string `json:"group"`
}

type StorageKeyMapping struct {
	Subject    string `json:"subject"`
	StorageKey string `json:"storageKey"`
}

type DevelopmentConfig struct {
	Enabled     bool             `json:"enabled"`
	DefaultUser string           `json:"defaultUser"`
	Users       []ConfiguredUser `json:"users"`
}

type ConfiguredUser struct {
	ID          string                      `json:"id"`
	DisplayName string                      `json:"displayName"`
	Enabled     bool                        `json:"enabled"`
	Groups      []string                    `json:"groups"`
	StorageKey  string                      `json:"storageKey,omitempty"`
	Credential  *StaticUserCredentialConfig `json:"credential,omitempty"`
}

type StaticUserCredentialConfig struct {
	Verifier string `json:"verifier"`
}

// AuthorizationConfig declares membership names, action sets, and resource grants.
// See docs/reference/authorization.md. Empty bindings always deny access.
type AuthorizationConfig struct {
	Groups   []GroupConfig   `json:"groups"`
	Roles    []RoleConfig    `json:"roles"`
	Bindings []BindingConfig `json:"bindings"`
}

type GroupConfig struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}
type RoleConfig struct {
	ID      string   `json:"id"`
	Actions []string `json:"actions"`
}
type SubjectConfig struct {
	Group         string `json:"group,omitempty"`
	ProviderID    string `json:"providerId,omitempty"`
	Subject       string `json:"subject,omitempty"`
	Authenticated bool   `json:"authenticated,omitempty"`
}
type RootRef struct {
	Tunnel string `json:"tunnel"`
	RootID string `json:"rootId"`
}
type BindingConfig struct {
	Subjects []SubjectConfig `json:"subjects"`
	Roles    []string        `json:"roles"`
	Roots    []RootRef       `json:"roots"`
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
	ID         string
	Label      *string
	ProviderID string
	AccountID  string
	Path       *string
	Settings   map[string]string
}

func (c CagnardConfig) AuthMode() string {
	if c.Auth.Development != nil && c.Auth.Development.Enabled {
		return "development"
	}
	if len(c.Auth.Providers) == 1 {
		return c.Auth.Providers[0].Type
	}
	return "providers"
}

func (c CagnardConfig) StaticUserCount() int {
	count := 0
	for _, provider := range c.Auth.Providers {
		count += len(provider.Users)
	}
	return count
}
