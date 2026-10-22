package authn

import (
	"bytes"
	"context"
	"encoding/pem"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func requireOIDCFailure(t *testing.T, err error, stage, reason string) *oidcFailure {
	t.Helper()
	var failure *oidcFailure
	if !errors.As(err, &failure) || failure.Stage != stage || failure.Reason != reason {
		t.Fatalf("expected %s/%s, got %v", stage, reason, err)
	}
	return failure
}

func TestOIDCTLSDefaultAndProviderIsolation(t *testing.T) {
	f := newIDPWithTLS(t, true)
	r := oidcResolver(f)
	_, _, err := r.StartOIDC(context.Background(), "company", "/")
	requireOIDCFailure(t, err, "discovery", "tls_unknown_authority")
	_, _, err = r.StartOIDC(context.Background(), "company", "/")
	if !requireOIDCFailure(t, err, "discovery", "tls_unknown_authority").Backoff {
		t.Fatal("cached discovery failure lost backoff diagnostic")
	}

	cfg := r.cfg
	cfg.Auth.Providers[1].TrustAllCertificates = true
	strict := cfg.Auth.Providers[1]
	strict.ID, strict.TrustAllCertificates = "strict", false
	cfg.Auth.Providers = append(cfg.Auth.Providers, strict)
	r = NewUserResolver(cfg)
	req := oidcAttempt(t, f, r, nil, false)
	token, _, err := r.CompleteOIDC(req, "company")
	if err != nil || token == "" {
		t.Fatalf("TLS discovery, exchange and JWKS failed: %v", err)
	}
	_, _, err = r.StartOIDC(context.Background(), "strict", "/")
	requireOIDCFailure(t, err, "discovery", "tls_unknown_authority")
	if http.DefaultTransport.(*http.Transport).TLSClientConfig != nil && http.DefaultTransport.(*http.Transport).TLSClientConfig.InsecureSkipVerify {
		t.Fatal("global TLS verification disabled")
	}
	_, _, err = r.CompleteOIDC(oidcAttempt(t, f, r, nil, true), "company")
	requireOIDCFailure(t, err, "id_token", "signature_invalid")
	evidence, failure := r.sessions.Verify(token)
	if failure != nil {
		t.Fatal(failure)
	}
	cfg.Auth.Providers[1].TrustAllCertificates = false
	if _, failure = r.Resolve(RequestIdentity{&evidence}); failure == nil {
		t.Fatal("session issued under bypass survived TLS policy change")
	}
}

func TestOIDCTrustedCAFromEnvironment(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("the released Linux container uses SSL_CERT_DIR; other platforms have different trust stores")
	}
	// System root pools are cached process-wide. A child verifies the actual
	// deployment environment variables independently of earlier TLS tests.
	if os.Getenv("CAGNARD_TEST_CA_CHILD") != "1" {
		binary, err := os.Executable()
		if err != nil {
			t.Fatal(err)
		}
		cmd := exec.Command(binary, "-test.run=^TestOIDCTrustedCAFromEnvironment$")
		cmd.Env = append(os.Environ(), "CAGNARD_TEST_CA_CHILD=1")
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("CA environment flow failed: %v\n%s", err, output)
		}
		return
	}
	f := newIDPWithTLS(t, true)
	dir := t.TempDir()
	cert := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: f.server.Certificate().Raw})
	if err := os.WriteFile(filepath.Join(dir, "keycloak-ca.crt"), cert, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SSL_CERT_DIR", dir)
	t.Setenv("SSL_CERT_FILE", filepath.Join(dir, "no-default-bundle"))
	r := oidcResolver(f)
	if r.cfg.Auth.Providers[1].TrustAllCertificates {
		t.Fatal("trusted CA test must retain TLS verification")
	}
	if token, _, err := r.CompleteOIDC(oidcAttempt(t, f, r, nil, false), "company"); err != nil || token == "" {
		t.Fatalf("trusted CA flow failed: %v", err)
	}
}

func TestOIDCTLSWarningAndHTTPSRequirement(t *testing.T) {
	f := newIDP(t)
	cfg := oidcResolver(f).cfg
	cfg.Auth.Providers[1].TrustAllCertificates = true
	cfg.Auth.AllowInsecureLoopback = false
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	r := NewUserResolver(cfg)
	if !strings.Contains(logs.String(), "level=WARN") || !strings.Contains(logs.String(), "provider=company") || !strings.Contains(logs.String(), "trustAllCertificates=true") {
		t.Fatalf("missing startup warning: %s", logs.String())
	}
	if _, _, err := r.StartOIDC(context.Background(), "company", "/"); err == nil {
		t.Fatal("TLS bypass allowed cleartext HTTP")
	}
}

func TestOIDCDiscoveryBackoffRecovers(t *testing.T) {
	f := newIDP(t)
	r := oidcResolver(f)
	f.mu.Lock()
	f.outage = true
	f.mu.Unlock()
	_, _, err := r.StartOIDC(context.Background(), "company", "/")
	if requireOIDCFailure(t, err, "discovery", "http_error").HTTPStatus != 503 {
		t.Fatal("discovery status lost")
	}
	f.mu.Lock()
	f.outage = false
	f.mu.Unlock()
	_, _, err = r.StartOIDC(context.Background(), "company", "/")
	if !requireOIDCFailure(t, err, "discovery", "http_error").Backoff {
		t.Fatal("backoff not retained")
	}
	r.clock = func() time.Time { return time.Now().Add(31 * time.Second) }
	if _, _, err = r.StartOIDC(context.Background(), "company", "/"); err != nil {
		t.Fatalf("provider did not recover: %v", err)
	}
}
