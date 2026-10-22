package authn

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"log/slog"
	"net"
	"strconv"
	"strings"

	oidc "github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// Only fixed diagnostic values are retained. Library errors can embed tokens,
// callback parameters, or entire upstream response bodies, even at debug level.
type oidcFailure struct {
	Stage, Reason string
	HTTPStatus    int
	Backoff       bool
}

func (e *oidcFailure) Error() string { return e.Stage + ": " + e.Reason }

func (e *oidcFailure) LogValue() slog.Value {
	attrs := []slog.Attr{slog.String("stage", e.Stage), slog.String("reason", e.Reason)}
	if e.HTTPStatus != 0 {
		attrs = append(attrs, slog.Int("http_status", e.HTTPStatus))
	}
	if e.Backoff {
		attrs = append(attrs, slog.Bool("backoff", true), slog.Int("retry_after_seconds", 30))
	}
	return slog.GroupValue(attrs...)
}

func oidcError(stage, reason string) *oidcFailure {
	return &oidcFailure{Stage: stage, Reason: reason}
}

func diagnoseOIDC(stage string, err error) *oidcFailure {
	d := oidcError(stage, "request_failed")
	var authority x509.UnknownAuthorityError
	var hostname x509.HostnameError
	var cert x509.CertificateInvalidError
	var verify *tls.CertificateVerificationError
	var dns *net.DNSError
	var connection *net.OpError
	var network net.Error
	var issuer *oidc.IssuerMismatchError
	var expired *oidc.TokenExpiredError
	var exchange *oauth2.RetrieveError
	var classified *oidcFailure
	switch {
	case errors.As(err, &classified):
		copy := *classified
		copy.Stage = stage
		return &copy
	case errors.As(err, &authority):
		d.Reason = "tls_unknown_authority"
	case errors.As(err, &hostname):
		d.Reason = "tls_hostname_mismatch"
	case errors.As(err, &cert):
		d.Reason = "tls_certificate_invalid"
	case errors.As(err, &verify):
		d.Reason = "tls_verification_failed"
	case errors.Is(err, context.DeadlineExceeded):
		d.Reason = "timeout"
	case errors.Is(err, context.Canceled):
		d.Reason = "request_canceled"
	case errors.As(err, &network) && network.Timeout():
		d.Reason = "timeout"
	case errors.As(err, &dns):
		d.Reason = "dns_failed"
	case errors.As(err, &connection):
		d.Reason = "connection_failed"
	case errors.As(err, &issuer):
		d.Reason = "issuer_mismatch"
	case errors.As(err, &expired):
		d.Reason = "token_expired"
	case errors.As(err, &exchange):
		d.Reason = "token_endpoint_error"
		if exchange.Response != nil {
			d.HTTPStatus = exchange.Response.StatusCode
		}
		// Never log error_description, error_uri, Body or unknown error codes.
		switch exchange.ErrorCode {
		case "invalid_client", "invalid_grant", "unauthorized_client", "invalid_scope", "invalid_request", "unsupported_grant_type", "access_denied", "server_error", "temporarily_unavailable":
			d.Reason = exchange.ErrorCode
		}
	default:
		// go-oidc does not expose typed errors for these cases. Match only its
		// fixed prefixes, never copy any dynamic error text into diagnostics.
		message := err.Error()
		switch {
		case strings.HasPrefix(message, "oidc: failed to decode provider discovery object:"):
			d.Reason = "invalid_discovery_document"
		case strings.HasPrefix(message, "oidc: id token issued by a different provider"):
			d.Reason = "issuer_mismatch"
		case strings.HasPrefix(message, "oidc: expected audience"):
			d.Reason = "audience_mismatch"
		case strings.HasPrefix(message, "oidc: current time"):
			d.Reason = "token_not_yet_valid"
		case strings.HasPrefix(message, "oidc: malformed jwt:"):
			d.Reason = "malformed_token_or_unsupported_algorithm"
		case strings.HasPrefix(message, "failed to verify signature: fetching keys"):
			d.Stage, d.Reason = "jwks", "key_fetch_failed"
		case strings.HasPrefix(message, "failed to verify signature:"):
			d.Reason = "signature_invalid"
		case strings.HasPrefix(message, "oidc: failed to unmarshal claims:"):
			d.Reason = "invalid_claims"
		default:
			if stage == "discovery" && len(message) > 3 && message[3] == ' ' {
				if status, e := strconv.Atoi(message[:3]); e == nil && status >= 100 && status <= 599 {
					d.Reason, d.HTTPStatus = "http_error", status
				}
			}
		}
	}
	return d
}
