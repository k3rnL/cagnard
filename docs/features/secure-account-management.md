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

- Current local development uses configured users with the `X-Cagnard-User` header.
- External OIDC authentication is specified as the preferred model.
- Credential material should be externalized through environment variables, mounted files, external secret providers, or delegated identity.

## Known Limitations

- Full credential handles, OIDC validation, secret rotation, and audit sink implementations are future work.
- Current prototype diagnostics are intentionally simple and avoid exposing secrets.
