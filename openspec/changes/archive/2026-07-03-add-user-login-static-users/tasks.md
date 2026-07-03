## 1. Backend Auth Model And Configuration

- [x] 1.1 Add provider-neutral authentication domain models for auth provider metadata, login requests, authenticated principals, auth failures, and stateless session claims.
- [x] 1.2 Extend HOCON config models and decoders with authentication mode, session signing settings, session lifetime, and static-user credential verifier fields.
- [x] 1.3 Update `config/cagnard.example.conf` with static login mode, a demo signing secret, and a clearly documented static-user password verifier example.
- [x] 1.4 Keep development identity fallback explicit and separate from static login mode.
- [x] 1.5 Add startup/config validation for missing session signing settings when login mode requires signed sessions.

## 2. Static Auth Provider And Stateless Sessions

- [x] 2.1 Implement an auth provider boundary that can register static users now and future OIDC/SSO providers later.
- [x] 2.2 Implement `StaticUserAuthProvider` to authenticate configured users through verifier material without exposing plaintext credentials or verifier values.
- [x] 2.3 Implement safe authentication failure handling so unknown users and invalid passwords return the same public failure category.
- [x] 2.4 Implement stateless signed session token issuance with provider id, subject, issued-at, and expiry claims.
- [x] 2.5 Implement stateless session verification and current-principal resolution from runtime configuration on every protected request.
- [x] 2.6 Implement logout cookie clearing or equivalent browser session credential removal.

## 3. Backend API Integration

- [x] 3.1 Add response/request models for auth provider discovery, login, logout, and unauthorized session state.
- [x] 3.2 Add `/api/auth/providers` to expose enabled login providers in a shape that can later describe OIDC/SSO providers.
- [x] 3.3 Add `/api/auth/login` for static-user login and session issuance.
- [x] 3.4 Add `/api/auth/logout` as an idempotent logout endpoint.
- [x] 3.5 Update `/api/session` and protected storage/plugin routes to use the new session resolver instead of hardcoded configured-user headers in static login mode.
- [x] 3.6 Preserve explicit development-mode behavior for local tests and demo workflows that still use configured user headers or default users.
- [x] 3.7 Return proper unauthorized HTTP status for missing, expired, malformed, or untrusted sessions.

## 4. Frontend Login Flow

- [x] 4.1 Remove the hardcoded `X-Cagnard-User: alice` default header from the frontend API client.
- [x] 4.2 Add frontend API client methods for auth provider discovery, login, logout, and unauthorized session handling.
- [x] 4.3 Add a provider-neutral login screen that renders static username/password login from auth provider discovery.
- [x] 4.4 Gate the storage browser behind authenticated session state.
- [x] 4.5 Refresh session, navigation, entries, and UI plugins after login succeeds.
- [x] 4.6 Clear frontend session state and return to login when logout succeeds or a protected API request returns unauthorized.
- [x] 4.7 Keep the login UI layout extensible for future OIDC/SSO buttons or redirects.

## 5. Documentation And Examples

- [x] 5.1 Update backend configuration documentation for authentication modes, static login, session signing, and development identity fallback.
- [x] 5.2 Update feature documentation with the static-user login flow and future OIDC/SSO extension points.
- [x] 5.3 Document static-user credential verifier handling, secret externalization, and no-secret-logging expectations.
- [x] 5.4 Update README local usage notes so users know how to log in to the browser.

## 6. Verification

- [x] 6.1 Add backend tests for static auth provider discovery, login success, invalid login privacy, session verification, logout, and unauthorized protected requests.
- [x] 6.2 Add backend tests for development identity mode compatibility.
- [x] 6.3 Add frontend type coverage for login/session API models and login flow state transitions.
- [x] 6.4 Run `sbt backend/test`.
- [x] 6.5 Run `pnpm --filter @cagnard/frontend typecheck`.
- [x] 6.6 Run `pnpm --filter @cagnard/frontend build`.
- [x] 6.7 Run OpenSpec validation for `add-user-login-static-users`.
