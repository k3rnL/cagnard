package api

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

func TestOIDCFailureLogsAndBrowserRedaction(t *testing.T) {
	const private = "private-client-secret-token-cookie-code-state"
	idp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(private))
	}))
	defer idp.Close()
	s, _, _ := newTransferTestServer(t)
	s.cfg.Auth.Development = nil
	s.cfg.Auth.Providers = []config.AuthProviderConfig{{ID: "company", Type: "oidc", Enabled: true, Issuer: idp.URL, ClientID: "app", ClientSecret: private}}
	s = NewServer(s.cfg)
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	for i := 0; i < 2; i++ {
		res := authRequest(s, "POST", "/api/auth/providers/company/start", `{"returnTo":"/"}`, "")
		if res.Code != 503 || !strings.Contains(res.Body.String(), "provider_unavailable") {
			t.Fatalf("unexpected start response: %d %s", res.Code, res.Body.String())
		}
		if strings.Contains(res.Body.String(), private) || strings.Contains(res.Body.String(), "http_error") {
			t.Fatal("backend diagnostics leaked into browser")
		}
	}
	res := authRequest(s, "GET", "/api/auth/providers/company/callback?code="+private+"&state="+private, "", "")
	if res.Code != 303 || res.Header().Get("Location") != "/?authError=sso_failed" {
		t.Fatal("callback feedback changed")
	}
	for _, expected := range []string{"provider=company", "outcome=start_failed", "failure.stage=discovery", "failure.reason=http_error", "failure.http_status=503", "failure.backoff=true", "outcome=callback_failed", "failure.reason=cookie_missing"} {
		if !strings.Contains(logs.String(), expected) {
			t.Fatalf("missing %s in logs: %s", expected, logs.String())
		}
	}
	if strings.Contains(logs.String(), private) {
		t.Fatal("authentication material leaked into logs")
	}
}
