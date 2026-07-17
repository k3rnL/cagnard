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
