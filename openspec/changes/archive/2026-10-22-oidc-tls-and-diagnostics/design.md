## Context

OIDC currently wraps the shared default HTTP transport and discards discovery and callback errors. The backend image supports Go's system CA settings, but the operator guide does not explain them.

## Goals / Non-Goals

Goals: enable an explicit provider TLS exception, retain verified TLS by default, diagnose login failures safely, document both deployment paths, and publish a patch release.

Non-goals: changing the browser login UI, disabling OIDC token checks, changing storage TLS policy, or adding a global insecure mode.

## Decisions

- Use `auth.providers[].trustAllCertificates` to match the existing storage terminology. Clone the HTTP transport per OIDC provider. The same bounded client handles discovery, token exchange and JWKS; no global transport mutation is permitted. HTTPS remains required outside explicit loopback development.
- Include the opt-in in identity configuration revisions so removing a bypass invalidates sessions minted with that exception. Preserve existing revisions when the new field is false.
- Emit a startup warning for each enabled provider using the bypass. Return typed, structured, safe diagnostics with stage, reason, and optional HTTP status. Classify TLS, DNS, timeout, HTTP, JSON, issuer and token errors without logging raw library errors, remote bodies, callback parameters or secrets. Preserve the diagnostic during discovery backoff.
- Keep browser responses generic. Report detailed operational context in backend logs, with fixed reason values and actionable documentation.
- Document mounting trusted PEM certificates with `SSL_CERT_DIR` as the preferred method, and the provider-specific bypass as the compatibility option. Include additive Helm/Compose snippets and restart guidance.

## Risks / Trade-offs

- Skipping certificate and hostname verification permits server impersonation and credential theft → default false, provider scope, visible startup warning and explicit documentation.
- Remote error bodies and token-verification errors can contain secrets → classify known errors into bounded fields; never forward raw error text into logs.
- TLS defaults accidentally change for another provider → regression tests exercise strict and insecure providers together and verify full TLS discovery/token/JWKS flows.

## Migration Plan

Release v0.12.1 with matching chart and application versions. Existing configurations remain valid. Operators add either a trusted CA mount or the opt-in, restart the backend and retry login. Remove the new configuration field before rolling back to v0.12.0, which rejects unknown auth fields.
