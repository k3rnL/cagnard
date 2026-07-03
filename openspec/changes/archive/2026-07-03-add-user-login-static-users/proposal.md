## Why

Cagnard currently resolves a user from a development header, a default configured user, or placeholder bearer-token parsing. That is useful for the prototype, but it is not enough for an operator-usable browser where a person must explicitly sign in before seeing personal or global storage.

This change adds a real login flow backed by statically declared users in HOCON while preserving the stateless backend direction and leaving OIDC/Keycloak as the preferred production authentication path.

## What Changes

- Add backend authentication endpoints for static-user login, logout, and current-session inspection.
- Add a frontend login screen and session state so the browser no longer hardcodes `X-Cagnard-User: alice`.
- Introduce a provider-neutral authentication boundary so static users are the first auth provider, not a static-user-specific architecture.
- Extend static user declarations so configured users can authenticate with password material supplied safely through hashes or external secret references.
- Keep the backend stateless: no user database, no server-side session store, and no required persistent login state.
- Preserve OIDC/SSO as the next authentication provider direction and avoid designing static users as a replacement for production identity providers.
- Update documentation and examples to explain static-user login, local development defaults, and security limitations.
- No **BREAKING** storage API changes are intended, but unauthenticated browser requests should receive an explicit unauthorized response instead of silently falling back to a default user when login is enabled.

## Capabilities

### New Capabilities

- `user-login-flow`: Explicit login/logout/session behavior for the API and frontend, including static-user credentials and stateless browser session handling.

### Modified Capabilities

- `stateless-backend-configuration`: Static configured users need authentication settings, credential references, and clear rules for default-user fallback versus explicit login mode.
- `secure-account-management`: Static-user password material and login diagnostics must follow the same secret externalization and no-secret-logging expectations as storage credentials.

## Impact

- Backend auth/config code: user resolution, HOCON models/codecs, API routes, and tests.
- Frontend API client and app shell: remove hardcoded user headers, add login/logout/session state, and gate the storage browser behind authentication.
- Example configuration and docs: add safe static-user examples and clarify local-only versus production guidance.
- CI/test surface: backend auth tests, frontend typecheck/build, and existing Docker/Helm validation should continue to pass.
