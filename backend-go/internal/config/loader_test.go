package config

import (
	"path/filepath"
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

func loadFixture(t *testing.T, path string) *CagnardConfig {
	t.Helper()
	cfg, err := Load(filepath.Clean(filepath.Join("..", "..", "..", path)))
	if err != nil {
		t.Fatalf("load %s: %v", path, err)
	}
	return cfg
}
