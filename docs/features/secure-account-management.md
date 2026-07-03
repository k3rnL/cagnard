# Secure Account Management

## Behavior

Cagnard supports multiple accounts per provider and evaluates account state before operations. Read-only accounts block mutations before provider writes.

Sensitive operations require explicit confirmation or approval:

- delete
- bulk delete
- overwrite
- future permission-changing or public-access operations

## Configuration

Accounts are declared under `accounts` and referenced by storage roots.

Important fields:

- `enabled`
- `readOnly`
- `authMode`
- `providerId`

## Operational Notes

- Current local development uses static login by default in the example config.
- `X-Cagnard-User` is available only when `auth.mode = development`.
- Static user password verifier material and session signing secrets are sensitive configuration.
- Credential material should be externalized through environment variables, mounted files, external secret providers, or delegated identity.
- Authentication failures return the same public category for unknown users and invalid passwords.
- Storage plugins and UI plugins receive normalized user/profile data, not password verifier material.

## Known Limitations

- Full credential handles, OIDC validation, secret rotation, and audit sink implementations are future work.
- Current prototype diagnostics are intentionally simple and avoid exposing secrets.
