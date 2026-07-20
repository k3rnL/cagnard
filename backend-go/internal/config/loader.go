package config

import (
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gurkankaymak/hocon"
)

func Load(path string) (*CagnardConfig, error) {
	normalized, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("invalid config path %s: %w", path, err)
	}
	normalized = filepath.Clean(normalized)

	parsed, err := hocon.ParseResource(normalized)
	if err != nil {
		return nil, fmt.Errorf("invalid config %s: %w", normalized, err)
	}

	root, ok := parsed.GetRoot().(hocon.Object)
	if !ok {
		return nil, fmt.Errorf("invalid config %s: root must be an object", normalized)
	}
	if _, legacyUIPlugins := root["uiPlugins"]; legacyUIPlugins {
		return nil, fmt.Errorf("invalid config %s: uiPlugins was removed; delete this section because file openers are now built into the frontend", normalized)
	}

	cfg, err := decode(root)
	if err != nil {
		return nil, fmt.Errorf("invalid config %s: %w", normalized, err)
	}
	resolveRelativePaths(normalized, cfg)
	if err := validate(normalized, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

func decode(root hocon.Object) (*CagnardConfig, error) {
	server := objectAt(root, "server")
	appearance := objectAt(root, "appearance")
	auth := objectAt(root, "auth")
	tasks := objectAt(root, "tasks")
	structuredData := objectAt(root, "structuredData")

	return &CagnardConfig{
		Server: ServerConfig{
			Host: stringOrDefault(server, "host", "127.0.0.1"),
			Port: intOrDefault(server, "port", 8080),
		},
		Appearance: AppearanceConfig{
			DefaultPalette:    AppearancePalette(stringOrDefault(appearance, "defaultPalette", string(AppearancePaletteClassic))),
			DefaultMode:       AppearanceMode(stringOrDefault(appearance, "defaultMode", string(AppearanceModeSystem))),
			AllowUserOverride: boolOrDefault(appearance, "allowUserOverride", true),
		},
		Tasks:          decodeTaskConfig(tasks),
		StructuredData: decodeStructuredDataConfig(structuredData),
		Auth: AuthConfig{
			Mode:                   optionalString(auth, "mode"),
			ConfiguredUsersEnabled: boolOrDefault(auth, "configuredUsersEnabled", false),
			DefaultUser:            optionalString(auth, "defaultUser"),
			Session:                decodeSession(objectAt(auth, "session")),
			StaticProvider:         decodeStaticProvider(objectAt(auth, "staticProvider")),
			OIDCProviders:          decodeOIDCProviders(arrayAt(auth, "oidcProviders")),
		},
		Users:           decodeUsers(arrayAt(root, "users")),
		Providers:       decodeProviders(arrayAt(root, "providers")),
		Accounts:        decodeAccounts(arrayAt(root, "accounts")),
		PersonalStorage: decodeStorageRoots(arrayAt(root, "personalStorage")),
		GlobalStorage:   decodeStorageRoots(arrayAt(root, "globalStorage")),
	}, nil
}

func decodeStructuredDataConfig(root hocon.Object) StructuredDataConfig {
	defaults := DefaultStructuredDataConfig()
	relational := objectAt(root, "relational")
	sql := objectAt(root, "sql")
	worker := objectAt(root, "worker")
	iceberg := objectAt(root, "iceberg")
	netcdf := objectAt(root, "netcdf")
	exports := objectAt(root, "exports")
	return StructuredDataConfig{
		Relational: StructuredRelationalConfig{
			MaxIngestionBytes: int64OrDefault(relational, "maxIngestionBytes", defaults.Relational.MaxIngestionBytes),
			MaxIngestionRows:  int64OrDefault(relational, "maxIngestionRows", defaults.Relational.MaxIngestionRows),
		},
		SQL: StructuredSQLConfig{
			TimeoutMilliseconds: int64OrDefault(sql, "timeoutMilliseconds", defaults.SQL.TimeoutMilliseconds),
			MaxResultRows:       int64OrDefault(sql, "maxResultRows", defaults.SQL.MaxResultRows),
			MaxQueryCharacters:  int64OrDefault(sql, "maxQueryCharacters", defaults.SQL.MaxQueryCharacters),
		},
		Worker: StructuredWorkerConfig{
			MaxResponseBytes: int64OrDefault(worker, "maxResponseBytes", defaults.Worker.MaxResponseBytes),
		},
		Iceberg: StructuredIcebergConfig{
			MaxMetadataBytes: int64OrDefault(iceberg, "maxMetadataBytes", defaults.Iceberg.MaxMetadataBytes),
			MaxProbeEntries:  int64OrDefault(iceberg, "maxProbeEntries", defaults.Iceberg.MaxProbeEntries),
		},
		NetCDF: StructuredNetCDFConfig{
			MaxSourceBytes:    int64OrDefault(netcdf, "maxSourceBytes", defaults.NetCDF.MaxSourceBytes),
			MaxSliceCells:     int64OrDefault(netcdf, "maxSliceCells", defaults.NetCDF.MaxSliceCells),
			MaxSliceBytes:     int64OrDefault(netcdf, "maxSliceBytes", defaults.NetCDF.MaxSliceBytes),
			MaxProjectionRows: int64OrDefault(netcdf, "maxProjectionRows", defaults.NetCDF.MaxProjectionRows),
			MaxPlotCells:      int64OrDefault(netcdf, "maxPlotCells", defaults.NetCDF.MaxPlotCells),
		},
		Exports: StructuredExportConfig{
			MaxRows:  int64OrDefault(exports, "maxRows", defaults.Exports.MaxRows),
			MaxBytes: int64OrDefault(exports, "maxBytes", defaults.Exports.MaxBytes),
		},
		DirectContentFullReads: boolOrDefault(root, "directContentFullReads", defaults.DirectContentFullReads),
	}
}

func decodeTaskConfig(tasks hocon.Object) TaskConfig {
	transfers := intOrDefault(tasks, "maxConcurrentTransfers", 4)
	items := transfers
	if configured := optionalInt64(tasks, "maxConcurrentItems"); configured != nil {
		items = int(*configured)
	}
	return TaskConfig{MaxConcurrentTransfers: transfers, MaxConcurrentItems: items}
}

func decodeSession(obj hocon.Object) *SessionConfig {
	if obj == nil {
		return nil
	}
	return &SessionConfig{
		SigningSecret: optionalString(obj, "signingSecret"),
		TTLSeconds:    optionalInt64(obj, "ttlSeconds"),
		CookieName:    optionalString(obj, "cookieName"),
		SecureCookies: optionalBool(obj, "secureCookies"),
	}
}

func decodeStaticProvider(obj hocon.Object) *StaticProviderConfig {
	if obj == nil {
		return nil
	}
	return &StaticProviderConfig{
		ID:      optionalString(obj, "id"),
		Label:   optionalString(obj, "label"),
		Enabled: optionalBool(obj, "enabled"),
	}
}

func decodeOIDCProviders(values hocon.Array) []OIDCProviderConfig {
	out := make([]OIDCProviderConfig, 0, len(values))
	for _, value := range values {
		obj, ok := value.(hocon.Object)
		if !ok {
			continue
		}
		out = append(out, OIDCProviderConfig{
			ID:          stringOrDefault(obj, "id", ""),
			Issuer:      stringOrDefault(obj, "issuer", ""),
			Audience:    stringOrDefault(obj, "audience", ""),
			GroupsClaim: stringOrDefault(obj, "groupsClaim", ""),
		})
	}
	return out
}

func decodeUsers(values hocon.Array) []ConfiguredUser {
	out := make([]ConfiguredUser, 0, len(values))
	for _, value := range values {
		obj, ok := value.(hocon.Object)
		if !ok {
			continue
		}
		user := ConfiguredUser{
			ID:          stringOrDefault(obj, "id", ""),
			DisplayName: stringOrDefault(obj, "displayName", ""),
			Roles:       stringSlice(obj, "roles"),
			Groups:      stringSlice(obj, "groups"),
			Claims:      stringMap(objectAt(obj, "claims")),
		}
		if credential := objectAt(obj, "credential"); credential != nil {
			user.Credential = &StaticUserCredentialConfig{Verifier: stringOrDefault(credential, "verifier", "")}
		}
		out = append(out, user)
	}
	return out
}

func decodeProviders(values hocon.Array) []ProviderConfig {
	out := make([]ProviderConfig, 0, len(values))
	for _, value := range values {
		obj, ok := value.(hocon.Object)
		if !ok {
			continue
		}
		out = append(out, ProviderConfig{
			ID:          stringOrDefault(obj, "id", ""),
			Type:        stringOrDefault(obj, "type", ""),
			Family:      stringOrDefault(obj, "family", ""),
			DisplayName: stringOrDefault(obj, "displayName", ""),
			Settings:    stringMap(objectAt(obj, "settings")),
		})
	}
	return out
}

func decodeAccounts(values hocon.Array) []StorageAccountConfig {
	out := make([]StorageAccountConfig, 0, len(values))
	for _, value := range values {
		obj, ok := value.(hocon.Object)
		if !ok {
			continue
		}
		out = append(out, StorageAccountConfig{
			ID:          stringOrDefault(obj, "id", ""),
			ProviderID:  stringOrDefault(obj, "providerId", ""),
			DisplayName: stringOrDefault(obj, "displayName", ""),
			Enabled:     boolOrDefault(obj, "enabled", false),
			ReadOnly:    boolOrDefault(obj, "readOnly", false),
			AuthMode:    stringOrDefault(obj, "authMode", ""),
			Settings:    stringMap(objectAt(obj, "settings")),
		})
	}
	return out
}

func decodeStorageRoots(values hocon.Array) []StorageRootConfig {
	out := make([]StorageRootConfig, 0, len(values))
	for _, value := range values {
		obj, ok := value.(hocon.Object)
		if !ok {
			continue
		}
		out = append(out, StorageRootConfig{
			ID:            stringOrDefault(obj, "id", ""),
			Label:         optionalString(obj, "label"),
			ProviderID:    stringOrDefault(obj, "providerId", ""),
			AccountID:     stringOrDefault(obj, "accountId", ""),
			Path:          optionalString(obj, "path"),
			Settings:      stringMap(objectAt(obj, "settings")),
			AllowedUsers:  stringSlice(obj, "allowedUsers"),
			AllowedRoles:  stringSlice(obj, "allowedRoles"),
			AllowedGroups: stringSlice(obj, "allowedGroups"),
		})
	}
	return out
}

func resolveRelativePaths(configPath string, cfg *CagnardConfig) {
	base := filepath.Dir(configPath)
	providerTypes := map[string]string{}
	for _, provider := range cfg.Providers {
		providerTypes[provider.ID] = provider.Type
	}
	resolveRoots := func(roots []StorageRootConfig) {
		for idx := range roots {
			root := &roots[idx]
			if providerTypes[root.ProviderID] != "filesystem" || root.Path == nil || strings.TrimSpace(*root.Path) == "" {
				continue
			}
			if filepath.IsAbs(*root.Path) {
				continue
			}
			resolved := filepath.Clean(filepath.Join(base, *root.Path))
			root.Path = &resolved
		}
	}
	resolveRoots(cfg.PersonalStorage)
	resolveRoots(cfg.GlobalStorage)
}

func validate(path string, cfg *CagnardConfig) error {
	authMode := cfg.AuthMode()
	validModes := map[string]bool{"static": true, "development": true, "external": true}
	var errs []string
	appearance := cfg.EffectiveAppearance()
	validPalettes := map[AppearancePalette]bool{AppearancePaletteClassic: true, AppearancePaletteSolar: true}
	validAppearanceModes := map[AppearanceMode]bool{AppearanceModeLight: true, AppearanceModeDark: true, AppearanceModeSystem: true}
	if !validPalettes[appearance.DefaultPalette] {
		errs = append(errs, "appearance.defaultPalette must be one of classic, solar")
	}
	if !validAppearanceModes[appearance.DefaultMode] {
		errs = append(errs, "appearance.defaultMode must be one of dark, light, system")
	}
	if cfg.Tasks.MaxConcurrentItems <= 0 {
		errs = append(errs, "tasks.maxConcurrentItems must be a positive integer")
	}
	if cfg.Tasks.MaxConcurrentTransfers <= 0 {
		errs = append(errs, "tasks.maxConcurrentTransfers must be a positive integer when configured")
	}
	errs = append(errs, structuredDataErrors(cfg.StructuredData)...)
	if !validModes[authMode] {
		errs = append(errs, "auth.mode must be one of development, external, static")
	}
	if authMode == "static" && !cfg.Auth.ConfiguredUsersEnabled {
		errs = append(errs, "auth.configuredUsersEnabled must be true when auth.mode = static")
	}
	if authMode == "static" && (cfg.Auth.Session == nil || cfg.Auth.Session.SigningSecret == nil || strings.TrimSpace(*cfg.Auth.Session.SigningSecret) == "") {
		errs = append(errs, "auth.session.signingSecret is required when auth.mode = static")
	}
	if authMode == "static" {
		for _, user := range cfg.Users {
			if user.Credential == nil || strings.TrimSpace(user.Credential.Verifier) == "" {
				errs = append(errs, "all configured users require users[].credential.verifier when auth.mode = static")
				break
			}
		}
	}
	errs = append(errs, providerErrors(cfg)...)
	if len(errs) > 0 {
		return fmt.Errorf("invalid config %s: %s", filepath.Clean(path), strings.Join(errs, "; "))
	}
	return nil
}

func structuredDataErrors(cfg StructuredDataConfig) []string {
	var errs []string
	check := func(name string, value int64, maximum int64) {
		if value <= 0 || value > maximum {
			errs = append(errs, fmt.Sprintf("structuredData.%s must be between 1 and %d", name, maximum))
		}
	}
	check("relational.maxIngestionBytes", cfg.Relational.MaxIngestionBytes, 512*1024*1024)
	check("relational.maxIngestionRows", cfg.Relational.MaxIngestionRows, 1_000_000)
	check("sql.timeoutMilliseconds", cfg.SQL.TimeoutMilliseconds, 120_000)
	check("sql.maxResultRows", cfg.SQL.MaxResultRows, 500_000)
	check("sql.maxQueryCharacters", cfg.SQL.MaxQueryCharacters, 200_000)
	check("worker.maxResponseBytes", cfg.Worker.MaxResponseBytes, 64*1024*1024)
	check("iceberg.maxMetadataBytes", cfg.Iceberg.MaxMetadataBytes, 16*1024*1024)
	check("iceberg.maxProbeEntries", cfg.Iceberg.MaxProbeEntries, 100_000)
	check("netcdf.maxSourceBytes", cfg.NetCDF.MaxSourceBytes, 512*1024*1024)
	check("netcdf.maxSliceCells", cfg.NetCDF.MaxSliceCells, 1_000_000)
	check("netcdf.maxSliceBytes", cfg.NetCDF.MaxSliceBytes, 64*1024*1024)
	check("netcdf.maxProjectionRows", cfg.NetCDF.MaxProjectionRows, 1_000_000)
	check("netcdf.maxPlotCells", cfg.NetCDF.MaxPlotCells, 100_000)
	check("exports.maxRows", cfg.Exports.MaxRows, 500_000)
	check("exports.maxBytes", cfg.Exports.MaxBytes, 64*1024*1024)
	if cfg.NetCDF.MaxPlotCells > cfg.NetCDF.MaxSliceCells {
		errs = append(errs, "structuredData.netcdf.maxPlotCells cannot exceed maxSliceCells")
	}
	if cfg.NetCDF.MaxProjectionRows > cfg.NetCDF.MaxSliceCells {
		errs = append(errs, "structuredData.netcdf.maxProjectionRows cannot exceed maxSliceCells")
	}
	if cfg.Exports.MaxBytes > cfg.Worker.MaxResponseBytes {
		errs = append(errs, "structuredData.exports.maxBytes cannot exceed worker.maxResponseBytes")
	}
	return errs
}

func providerErrors(cfg *CagnardConfig) []string {
	providersByID := map[string]ProviderConfig{}
	accountsByID := map[string]StorageAccountConfig{}
	s3ProviderIDs := map[string]bool{}
	for _, provider := range cfg.Providers {
		providersByID[provider.ID] = provider
		if provider.Type == "s3" {
			s3ProviderIDs[provider.ID] = true
		}
	}
	for _, account := range cfg.Accounts {
		accountsByID[account.ID] = account
	}

	var errs []string
	for _, provider := range cfg.Providers {
		switch provider.Type {
		case "filesystem":
		case "s3":
			if strings.TrimSpace(provider.Settings["region"]) == "" {
				errs = append(errs, fmt.Sprintf("providers.%s.settings.region is required for S3 providers", provider.ID))
			}
		default:
			errs = append(errs, fmt.Sprintf("providers.%s.type '%s' is not supported", provider.ID, provider.Type))
		}
	}
	for _, account := range cfg.Accounts {
		if !s3ProviderIDs[account.ProviderID] {
			continue
		}
		mode := strings.TrimSpace(account.Settings["credentialMode"])
		if mode == "" {
			mode = strings.TrimSpace(account.AuthMode)
		}
		if mode == "" {
			mode = "static"
		}
		switch mode {
		case "static":
			if strings.TrimSpace(account.Settings["accessKeyId"]) == "" {
				errs = append(errs, fmt.Sprintf("accounts.%s.settings.accessKeyId is required for static S3 credentials", account.ID))
			}
			if strings.TrimSpace(account.Settings["secretAccessKey"]) == "" {
				errs = append(errs, fmt.Sprintf("accounts.%s.settings.secretAccessKey is required for static S3 credentials", account.ID))
			}
		case "default-chain":
		case "profile":
			if strings.TrimSpace(account.Settings["profile"]) == "" {
				errs = append(errs, fmt.Sprintf("accounts.%s.settings.profile is required for S3 profile credentials", account.ID))
			}
		default:
			errs = append(errs, fmt.Sprintf("accounts.%s.settings.credentialMode '%s' is not supported for S3 accounts", account.ID, mode))
		}
	}
	for _, root := range append(append([]StorageRootConfig{}, cfg.PersonalStorage...), cfg.GlobalStorage...) {
		provider, providerFound := providersByID[root.ProviderID]
		if !providerFound {
			errs = append(errs, fmt.Sprintf("storage root %s references unknown provider '%s'", root.ID, root.ProviderID))
		}
		if _, ok := accountsByID[root.AccountID]; !ok {
			errs = append(errs, fmt.Sprintf("storage root %s references unknown account '%s'", root.ID, root.AccountID))
		}
		if providerFound && provider.Type == "filesystem" && (root.Path == nil || strings.TrimSpace(*root.Path) == "") {
			errs = append(errs, fmt.Sprintf("storage root %s.path is required for filesystem roots", root.ID))
		}
		if providerFound && provider.Type == "s3" && strings.TrimSpace(root.Settings["bucket"]) == "" {
			errs = append(errs, fmt.Sprintf("storage root %s.settings.bucket is required for S3 roots", root.ID))
		}
	}
	return errs
}

func objectAt(obj hocon.Object, key string) hocon.Object {
	if obj == nil {
		return nil
	}
	value, ok := obj[key]
	if !ok || value == nil || value.Type() == hocon.NullType {
		return nil
	}
	result, ok := value.(hocon.Object)
	if !ok {
		return nil
	}
	return result
}

func arrayAt(obj hocon.Object, key string) hocon.Array {
	if obj == nil {
		return nil
	}
	value, ok := obj[key]
	if !ok || value == nil || value.Type() == hocon.NullType {
		return nil
	}
	result, ok := value.(hocon.Array)
	if !ok {
		return nil
	}
	return result
}

func optionalString(obj hocon.Object, key string) *string {
	value, ok := valueAt(obj, key)
	if !ok {
		return nil
	}
	out := scalarString(value)
	return &out
}

func stringOrDefault(obj hocon.Object, key string, fallback string) string {
	if value := optionalString(obj, key); value != nil {
		return *value
	}
	return fallback
}

func optionalInt64(obj hocon.Object, key string) *int64 {
	value, ok := valueAt(obj, key)
	if !ok {
		return nil
	}
	switch v := value.(type) {
	case hocon.Int:
		out := int64(v)
		return &out
	default:
		parsed, err := strconv.ParseInt(value.String(), 10, 64)
		if err != nil {
			return nil
		}
		return &parsed
	}
}

func intOrDefault(obj hocon.Object, key string, fallback int) int {
	if value := optionalInt64(obj, key); value != nil {
		return int(*value)
	}
	return fallback
}

func int64OrDefault(obj hocon.Object, key string, fallback int64) int64 {
	if value := optionalInt64(obj, key); value != nil {
		return *value
	}
	return fallback
}

func optionalBool(obj hocon.Object, key string) *bool {
	value, ok := valueAt(obj, key)
	if !ok {
		return nil
	}
	switch v := value.(type) {
	case hocon.Boolean:
		out := bool(v)
		return &out
	default:
		parsed, err := strconv.ParseBool(value.String())
		if err != nil {
			return nil
		}
		return &parsed
	}
}

func boolOrDefault(obj hocon.Object, key string, fallback bool) bool {
	if value := optionalBool(obj, key); value != nil {
		return *value
	}
	return fallback
}

func stringSlice(obj hocon.Object, key string) []string {
	values := arrayAt(obj, key)
	if values == nil {
		return nil
	}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if value == nil || value.Type() == hocon.NullType {
			continue
		}
		out = append(out, scalarString(value))
	}
	return out
}

func stringMap(obj hocon.Object) map[string]string {
	if obj == nil {
		return nil
	}
	out := map[string]string{}
	for key, value := range obj {
		if value == nil || value.Type() == hocon.NullType {
			continue
		}
		out[key] = scalarString(value)
	}
	return out
}

func scalarString(value hocon.Value) string {
	switch v := value.(type) {
	case hocon.String:
		return strings.Trim(string(v), `"`)
	default:
		out := value.String()
		if unquoted, err := strconv.Unquote(out); err == nil {
			return unquoted
		}
		return out
	}
}

func valueAt(obj hocon.Object, key string) (hocon.Value, bool) {
	if obj == nil {
		return nil, false
	}
	value, ok := obj[key]
	if !ok || value == nil || value.Type() == hocon.NullType {
		return nil, false
	}
	return value, true
}
