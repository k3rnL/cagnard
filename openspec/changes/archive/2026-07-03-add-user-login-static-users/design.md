## Context

Cagnard currently resolves identity from `X-Cagnard-User`, a configured default user, or placeholder bearer-token parsing. That kept the prototype moving, but it couples browser usage to a development header and does not provide a real sign-in moment for users.

The backend must stay stateless. User declarations, authorization rules, provider accounts, storage roots, and UI plugin declarations come from HOCON configuration and external providers. This change should not add an application database or server-side session store.

This is also the first step toward a broader auth system. Static configured users are useful for local, demo, and small deployments, but OIDC/SSO through Keycloak or another provider is expected soon. The implementation must create an auth boundary that can accept new providers without rewriting storage authorization or the frontend app shell.

## Goals / Non-Goals

**Goals:**

- Add explicit login/logout/session API behavior for static configured users.
- Remove the frontend's hardcoded `X-Cagnard-User: alice` default.
- Keep all required auth state stateless and configuration-driven.
- Model static users as one implementation of a provider-neutral authentication flow.
- Leave clear extension points for OIDC/SSO provider discovery, login initiation, callback handling, and token/claims resolution.
- Keep authorization downstream of a normalized authenticated principal so storage access logic does not care which auth provider authenticated the user.

**Non-Goals:**

- Full OIDC authorization-code flow, callback handling, JWKS validation, refresh tokens, or SSO logout in this change.
- User self-service registration, password reset, account recovery, or profile editing.
- Server-side session persistence, refresh-token database, or audit database.
- Multi-factor authentication.
- Production password management beyond safe hash/reference handling and clear documentation of limitations.

## Decisions

### Introduce an auth-provider boundary

Create an auth boundary with a small provider-neutral model, such as:

- `AuthProvider`: identifies a provider and exposes supported login mode metadata.
- `AuthRequest`: typed login input for a provider.
- `AuthenticatedPrincipal`: normalized user identity with provider id, subject, display name, roles, groups, and claims.
- `AuthFailure`: safe failure codes that do not reveal whether a username or password was specifically wrong.

The static-user implementation becomes `StaticUserAuthProvider`. It authenticates a configured username/password against configured credential material and returns `AuthenticatedPrincipal`. Future `OidcAuthProvider` can return the same principal after validating an external token or handling an OIDC callback.

Alternative considered: keep `UserResolver` as a static-user-only resolver and add OIDC later beside it. That would duplicate session, claims, and authorization logic. A provider boundary is slightly more work now but prevents the first auth implementation from defining the permanent architecture.

### Use stateless signed browser sessions

After login, the backend should issue a stateless signed session token, preferably as an `HttpOnly`, `SameSite=Lax` cookie for the browser. API clients may also use `Authorization: Bearer <session-token>` if the implementation keeps that low-cost.

The session token should contain only stable identity routing data such as auth provider id, subject/user id, issued-at, and expiry. On each request, the backend resolves the current configured user and authorization data from HOCON rather than trusting stale roles embedded in the token. That keeps role/group/storage changes effective after a restart without a database migration.

The session signing key must be configuration-supplied when login is enabled, using HOCON substitution or a mounted secret reference. A demo-only value can exist in local example config if clearly documented as unsafe. Rotation can invalidate old sessions by changing the signing key or reducing token lifetime.

Alternative considered: store sessions server-side. That would simplify revocation but violates the stateless backend requirement and complicates horizontal scaling.

### Keep development identity fallback explicit

The current development header/default-user behavior should not remain an implicit browser login. If it stays, it must be controlled by an explicit development mode or compatibility flag, separate from real login mode.

Recommended modes:

- `static`: explicit static-user login is enabled.
- `external`: future OIDC/SSO mode.
- `development`: header/default-user fallback for local development and tests.

Unauthenticated requests in `static` or future `external` mode should return `401` with a safe error response. The frontend should react by showing the login screen.

Alternative considered: keep `auth.defaultUser` as a silent fallback in all modes. That is convenient for demos but unsafe once a login UI exists because it hides authentication failures and makes authorization behavior surprising.

### Store password material as verifier data, not plaintext

Static configured users should authenticate through password verifier material, not plaintext passwords. The first implementation can support a common JVM-friendly hash format such as BCrypt. Configuration can provide the hash directly or through HOCON environment substitution.

The implementation should keep the credential shape extensible enough for later secret sources, for example mounted files, external secret providers, or delegated identity metadata. Error messages and logs must not include password input or full hash values.

Alternative considered: allow plaintext static passwords for simplicity. That lowers friction but creates bad operator defaults and becomes harder to remove later.

### Expose auth provider discovery to the frontend

The frontend should not hardcode "static login" as the only possible auth experience. Add a provider discovery response that can describe enabled login providers:

- static provider: render username/password form.
- future OIDC provider: render SSO button or redirect action.

For this change, the discovery response can return only static-user login metadata. The shape should still anticipate OIDC labels, provider ids, and login initiation URLs.

Alternative considered: frontend posts directly to `/api/auth/login` without provider discovery. That is acceptable for a demo, but it would require a UI rewrite when OIDC is added.

### Keep storage authorization provider-neutral

Storage authorization should consume `AuthenticatedPrincipal`/`UserProfile`, not static-user config directly. `AccessService`, navigation, and operation authorization should receive the same normalized user information regardless of whether the user came from static login, dev header, or future OIDC claims.

Group/role mapping for OIDC remains a later provider responsibility, but the output should match the existing roles/groups/claims model.

## Risks / Trade-offs

- Stateless sessions cannot be individually revoked without a store -> use short TTLs, signing-key rotation, and config changes that prevent the resolved user from authorizing.
- Static user password hashes in config can still be sensitive -> document environment substitution, mounted secrets, and no-secret-logging expectations.
- Introducing provider discovery now adds API surface before OIDC exists -> keep it small and stable around provider id/type/label/capabilities.
- Removing silent default-user fallback may affect local demos -> keep an explicit development mode and update examples.
- Cookie auth needs frontend/backend same-origin assumptions -> production frontend already proxies `/api`; document cross-origin deployments before expanding.

## Migration Plan

1. Add auth config model fields for mode, session signing, static provider enablement, and static user password verifier metadata.
2. Add provider-neutral auth models and `StaticUserAuthProvider`.
3. Replace request identity resolution with session-token resolution while preserving an explicit development fallback mode.
4. Add `/api/auth/providers`, `/api/auth/login`, `/api/auth/logout`, and update `/api/session` to return authenticated session state or `401`.
5. Update the frontend API client to rely on cookie/session state and remove hardcoded `X-Cagnard-User`.
6. Add a login screen that renders static login from provider discovery and leaves space for future SSO actions.
7. Update example HOCON and docs with static-user login and local/development mode guidance.
8. Add backend and frontend tests for login success/failure, session use, logout, and unauthorized browser access.

Rollback is straightforward while this is unreleased: restore development-header/default-user behavior in the frontend and remove the new auth endpoints/config fields. After release, rollback should keep endpoint stubs returning clear unavailable errors to avoid frontend confusion.

## Open Questions

- Should the first static password verifier be BCrypt only, or should the config model name a verifier algorithm from the start?
- Should browser sessions be cookie-only in the first implementation, or should API clients also receive a bearer token in the login response?
- What default session TTL is appropriate for local/small deployments?
- Should `auth.defaultUser` remain in config as development-only, or be renamed to make unsafe fallback impossible to enable accidentally?
