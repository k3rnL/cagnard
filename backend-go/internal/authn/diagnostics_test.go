package authn

import (
	"bytes"
	"context"
	"crypto/x509"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	oidc "github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

func TestOIDCDiagnosticsRedactUntrustedErrors(t *testing.T) {
	const secret = "sensitive-token-client-secret-state"
	for _, test := range []struct {
		name, stage, reason string
		err                 error
	}{
		{"dns", "discovery", "dns_failed", &url.Error{Op: "Get", URL: "https://idp/?token=" + secret, Err: &net.DNSError{Err: secret, Name: secret}}},
		{"tls", "discovery", "tls_unknown_authority", x509.UnknownAuthorityError{Cert: &x509.Certificate{}}},
		{"timeout", "discovery", "timeout", fmt.Errorf("%s: %w", secret, context.DeadlineExceeded)},
		{"issuer", "discovery", "issuer_mismatch", &oidc.IssuerMismatchError{Provided: secret, Discovered: secret}},
		{"http", "discovery", "http_error", errors.New("403 Forbidden: " + secret)},
		{"json", "discovery", "invalid_discovery_document", errors.New("oidc: failed to decode provider discovery object: " + secret)},
		{"client", "token_exchange", "invalid_client", &oauth2.RetrieveError{Response: &http.Response{StatusCode: 401}, Body: []byte(secret), ErrorCode: "invalid_client", ErrorDescription: secret, ErrorURI: secret}},
		{"unknown-code", "token_exchange", "token_endpoint_error", &oauth2.RetrieveError{Body: []byte(secret), ErrorCode: secret}},
		{"audience", "id_token", "audience_mismatch", errors.New("oidc: expected audience " + secret)},
		{"keys", "jwks", "key_fetch_failed", errors.New("failed to verify signature: fetching keys oidc: get keys failed: " + secret)},
		{"unknown", "id_token", "request_failed", errors.New(secret)},
	} {
		t.Run(test.name, func(t *testing.T) {
			failure := diagnoseOIDC(test.stage, test.err)
			requireOIDCFailure(t, failure, test.stage, test.reason)
			var logs bytes.Buffer
			slog.New(slog.NewTextHandler(&logs, nil)).Warn("authentication", "failure", failure)
			if strings.Contains(logs.String()+failure.Error(), secret) {
				t.Fatalf("diagnostic leaked sensitive content: %s", logs.String())
			}
			if !strings.Contains(logs.String(), "failure.reason="+test.reason) {
				t.Fatalf("structured reason missing: %s", logs.String())
			}
		})
	}
}

func TestOIDCDiscoveryDiagnostics(t *testing.T) {
	for _, test := range []struct{ name, body, reason string }{
		{"invalid-json", "not JSON", "invalid_discovery_document"},
		{"wrong-issuer", `{"issuer":"https://other.example"}`, "issuer_mismatch"},
		{"invalid-endpoint", `{"issuer":"ISSUER","authorization_endpoint":"http://external.example/authorize"}`, "invalid_authorization_endpoint"},
	} {
		t.Run(test.name, func(t *testing.T) {
			var server *httptest.Server
			server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprint(w, strings.ReplaceAll(test.body, "ISSUER", server.URL))
			}))
			defer server.Close()
			r := oidcResolver(&fakeIDP{server: server})
			_, _, err := r.StartOIDC(context.Background(), "company", "/")
			requireOIDCFailure(t, err, "discovery", test.reason)
		})
	}
}

func TestOIDCCallbackDiagnostics(t *testing.T) {
	f := newIDP(t)
	r := oidcResolver(f)
	for _, test := range []struct {
		name, stage, reason string
		mutate              func(*http.Request)
	}{
		{"cookie", "transaction", "cookie_missing", func(req *http.Request) { req.Header.Del("Cookie") }},
		{"state", "transaction", "state_mismatch", func(req *http.Request) {
			q := req.URL.Query()
			q.Set("state", "private-state")
			req.URL.RawQuery = q.Encode()
		}},
		{"denied", "callback", "access_denied", func(req *http.Request) {
			q := req.URL.Query()
			q.Set("error", "access_denied")
			req.URL.RawQuery = q.Encode()
		}},
		{"unknown-error", "callback", "provider_returned_error", func(req *http.Request) {
			q := req.URL.Query()
			q.Set("error", "secret-in-error")
			req.URL.RawQuery = q.Encode()
		}},
		{"code", "callback", "code_missing_or_repeated", func(req *http.Request) { q := req.URL.Query(); q.Del("code"); req.URL.RawQuery = q.Encode() }},
	} {
		t.Run(test.name, func(t *testing.T) {
			req := oidcAttempt(t, f, r, nil, false)
			test.mutate(req)
			_, _, err := r.CompleteOIDC(req, "company")
			requireOIDCFailure(t, err, test.stage, test.reason)
		})
	}
	req := oidcAttempt(t, f, r, nil, false)
	r.cfg.Auth.Providers[1].ClientSecret = "wrong-secret"
	_, _, err := r.CompleteOIDC(req, "company")
	requireOIDCFailure(t, err, "token_exchange", "invalid_grant")
}
