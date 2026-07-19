package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadExampleConfig(t *testing.T) {
	cfg := loadFixture(t, "config/cagnard.example.conf")

	if cfg.Server.Host != "0.0.0.0" {
		t.Fatalf("host = %q", cfg.Server.Host)
	}
	if cfg.AuthMode() != "static" {
		t.Fatalf("auth mode = %q", cfg.AuthMode())
	}
	if cfg.Tasks.MaxConcurrentTransfers != 4 {
		t.Fatalf("max concurrent transfers = %d", cfg.Tasks.MaxConcurrentTransfers)
	}
	if cfg.Tasks.MaxConcurrentItems != 4 {
		t.Fatalf("max concurrent items = %d", cfg.Tasks.MaxConcurrentItems)
	}
	if cfg.Appearance != DefaultAppearanceConfig() {
		t.Fatalf("appearance = %#v", cfg.Appearance)
	}
	if cfg.StructuredData != DefaultStructuredDataConfig() {
		t.Fatalf("structured data = %#v", cfg.StructuredData)
	}
	if len(cfg.Users) != 1 || cfg.Users[0].ID != "alice" {
		t.Fatalf("users = %#v", cfg.Users)
	}
	if got := cfg.Providers[0].Type; got != "filesystem" {
		t.Fatalf("provider type = %q", got)
	}
	if cfg.PersonalStorage[0].Path == nil || !filepath.IsAbs(*cfg.PersonalStorage[0].Path) {
		t.Fatalf("personal root path was not resolved to absolute path: %#v", cfg.PersonalStorage[0].Path)
	}
}

func TestStructuredDataConfigurationDefaultsOverridesAndValidation(t *testing.T) {
	defaults, err := Load(writeConfigFixture(t, "{}"))
	if err != nil {
		t.Fatal(err)
	}
	if defaults.StructuredData != DefaultStructuredDataConfig() {
		t.Fatalf("default structured data = %#v", defaults.StructuredData)
	}

	configured, err := Load(writeConfigFixture(t, `structuredData {
  relational { maxIngestionBytes = 33554432, maxIngestionRows = 12345 }
  sql { timeoutMilliseconds = 45000, maxResultRows = 12000, maxQueryCharacters = 50000 }
  worker { maxResponseBytes = 8388608 }
  iceberg { maxMetadataBytes = 1048576, maxProbeEntries = 5000 }
  netcdf {
    maxSourceBytes = 67108864
    maxSliceCells = 50000
    maxSliceBytes = 4194304
    maxProjectionRows = 40000
    maxPlotCells = 10000
  }
  exports { maxRows = 20000, maxBytes = 4194304 }
}`))
	if err != nil {
		t.Fatal(err)
	}
	if configured.StructuredData.SQL.TimeoutMilliseconds != 45_000 || configured.StructuredData.NetCDF.MaxSliceCells != 50_000 {
		t.Fatalf("configured structured data = %#v", configured.StructuredData)
	}

	for _, invalid := range []string{
		`structuredData { sql { timeoutMilliseconds = 0 } }`,
		`structuredData { netcdf { maxSliceCells = 10, maxPlotCells = 11 } }`,
		`structuredData { worker { maxResponseBytes = 1024 }, exports { maxBytes = 2048 } }`,
	} {
		if _, err := Load(writeConfigFixture(t, invalid)); err == nil || !strings.Contains(err.Error(), "structuredData") {
			t.Fatalf("invalid structured data config %q error = %v", invalid, err)
		}
	}
}

func TestAppearanceConfiguration(t *testing.T) {
	defaultConfig := writeConfigFixture(t, "{}")
	defaults, err := Load(defaultConfig)
	if err != nil {
		t.Fatal(err)
	}
	if defaults.Appearance != DefaultAppearanceConfig() {
		t.Fatalf("default appearance = %#v", defaults.Appearance)
	}

	configuredPath := writeConfigFixture(t, `appearance {
  defaultPalette = solar
  defaultMode = dark
  allowUserOverride = false
}`)
	configured, err := Load(configuredPath)
	if err != nil {
		t.Fatal(err)
	}
	if configured.Appearance.DefaultPalette != AppearancePaletteSolar || configured.Appearance.DefaultMode != AppearanceModeDark || configured.Appearance.AllowUserOverride {
		t.Fatalf("configured appearance = %#v", configured.Appearance)
	}
}

func TestTaskConcurrencyConfigurationAndCompatibilityFallback(t *testing.T) {
	legacy, err := Load(writeConfigFixture(t, `tasks { maxConcurrentTransfers = 7 }`))
	if err != nil {
		t.Fatal(err)
	}
	if legacy.Tasks.MaxConcurrentItems != 7 {
		t.Fatalf("legacy task fallback = %d", legacy.Tasks.MaxConcurrentItems)
	}
	configured, err := Load(writeConfigFixture(t, `tasks { maxConcurrentTransfers = 7, maxConcurrentItems = 3 }`))
	if err != nil {
		t.Fatal(err)
	}
	if configured.Tasks.MaxConcurrentItems != 3 {
		t.Fatalf("generic task concurrency = %d", configured.Tasks.MaxConcurrentItems)
	}
	if _, err := Load(writeConfigFixture(t, `tasks { maxConcurrentItems = 0 }`)); err == nil || !strings.Contains(err.Error(), "tasks.maxConcurrentItems") {
		t.Fatalf("invalid task concurrency error = %v", err)
	}
}

func TestRejectInvalidAppearanceConfiguration(t *testing.T) {
	tests := []struct {
		name       string
		config     string
		expectedIn string
	}{
		{name: "palette", config: `appearance { defaultPalette = purple }`, expectedIn: "appearance.defaultPalette"},
		{name: "mode", config: `appearance { defaultMode = sepia }`, expectedIn: "appearance.defaultMode"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := Load(writeConfigFixture(t, test.config))
			if err == nil || !strings.Contains(err.Error(), test.expectedIn) {
				t.Fatalf("error = %v, want diagnostic containing %q", err, test.expectedIn)
			}
		})
	}
}

func TestLoadRunnableExampleConfigs(t *testing.T) {
	paths := []string{
		"examples/run/local-filesystem-static/cagnard.conf",
		"examples/run/s3-minio-static/cagnard.conf",
		"examples/run/local-and-s3-static/cagnard.conf",
	}
	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			cfg := loadFixture(t, path)
			if cfg.AuthMode() != "static" {
				t.Fatalf("auth mode = %q", cfg.AuthMode())
			}
			if len(cfg.Users) == 0 {
				t.Fatal("expected configured users")
			}
			if len(cfg.Providers) == 0 {
				t.Fatal("expected providers")
			}
		})
	}
}

func TestRejectInvalidStaticConfig(t *testing.T) {
	_, err := Load(filepath.Join(t.TempDir(), "missing.conf"))
	if err == nil {
		t.Fatal("expected missing config error")
	}
}

func TestRejectLegacyUIPluginsConfiguration(t *testing.T) {
	_, err := Load(writeConfigFixture(t, `uiPlugins = []`))
	if err == nil || !strings.Contains(err.Error(), "uiPlugins was removed") {
		t.Fatalf("error = %v, want actionable uiPlugins migration diagnostic", err)
	}
}

func loadFixture(t *testing.T, path string) *CagnardConfig {
	t.Helper()
	cfg, err := Load(filepath.Clean(filepath.Join("..", "..", "..", path)))
	if err != nil {
		t.Fatalf("load %s: %v", path, err)
	}
	return cfg
}

func writeConfigFixture(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "cagnard.conf")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}
