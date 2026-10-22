## Why

Production OIDC deployments with private or self-signed TLS certificates currently fail with an opaque `start_failed` log. Operators need an explicit compatibility option, actionable diagnostics, and clear instructions for installing a trusted CA.

## What Changes

- Add OIDC provider `trustAllCertificates`, default false, covering discovery, token exchange, and signing-key requests for that provider only.
- Log safe failure stages and reasons throughout OIDC login, including cached discovery failures, and warn when certificate verification is disabled.
- Document trusted certificate installation and the explicit TLS verification bypass with Helm and Compose examples.
- Publish v0.12.1 with aligned frontend, backend, and chart versions. Browser messages and controls remain unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `oidc-browser-login`: provider-scoped TLS policy and safe operational diagnostics.

## Impact

Backend auth configuration, OIDC HTTP clients, authentication logs and regression tests; operator references, deployment examples, release notes and package versions. No new dependency or browser API contract is required.
