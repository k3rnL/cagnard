## 1. Foundation: fail-closed authentication and identity

- [x] 1.1 Add regression coverage for malformed, unsigned, expired, wrong-issuer, and partial external identities; remove the external bearer placeholder and implicit development fallback.
- [x] 1.2 Add canonical provider-qualified principal and structured identity-reference types; test collisions across providers, issuers, and delimiter-containing subjects.
- [x] 1.3 Introduce a provider registry and authentication middleware with explicit public/protected route registration; adapt static login without changing password verifier compatibility.
- [x] 1.4 Add explicit development configuration for tests/local use, mutually exclusive with real login providers; reject malformed provider configuration; OIDC is implemented in milestone two.

## 2. Foundation: configuration and shared sessions

- [x] 2.1 Implement version-two authentication/authorization configuration and validation of provider/user/group/role/root IDs, known actions, mappings, account relationships, and session options.
- [x] 2.2 Select and pin reviewed protected-cookie support; implement versioned encrypted sessions, absolute expiry, provider binding, size bounds, and invalidation of legacy cookies. Separate session/transaction/pagination key purposes and remove pagination's empty-secret fallback during configuration migration.
- [x] 2.3 Re-resolve enabled static users/groups on requests and invalidate sessions after verifier changes using a safe credential revision; test removal, disablement, tampering, expiry, and key rotation.
- [x] 2.4 Apply configured-origin and custom-header checks to browser mutation routes; update API clients and remove permissive CORS and overloaded bearer-session handling.
- [x] 2.5 Add sanitized authentication outcome events and safe public errors without credentials or complete claims.

## 3. Foundation: centralized permissions and storage targeting

- [x] 3.1 Implement declared groups, explicit action roles, scoped bindings, additive grants, default deny, and explicit authenticated subjects with table-driven policy tests.
- [x] 3.2 Add current static membership resolution and the provider-scoped external-mapping contract, including JSON Pointer selection, invalid types, and unknown-value handling.
- [x] 3.3 Implement safe principal storage keys and consistent filesystem/S3 target derivation; test existing-home preservation, confinement, conflicting assignments, and unsafe values.
- [x] 3.4 Build the shared authorized storage access service and effective action calculation, preserving account read-only and provider-capability restrictions.
- [x] 3.5 Replace duplicated direct/transfer root checks and route all copy/move/rename/delete/upload operations through the action-composition contract.
- [x] 3.6 Cover content, ranges, previews, archive members, search, Iceberg references, and watch routes with the same read authorization; add bypass regression tests.
- [x] 3.7 Return consistent 401/403/404 responses and emit sanitized actor/resource/action decision and mutation audit context.

## 4. Foundation: task identity and lifetime

- [x] 4.1 Replace bare user IDs with canonical principal IDs for task ownership and browser synchronization channels; verify foreign-provider task isolation.
- [x] 4.2 Replace raw request identity passed into jobs with bounded verified execution context; reauthorize new operations and explicit continuations.
- [x] 4.3 Enforce authentication deadlines on jobs and stream/watch contexts; test partial effects, expiry during recursive work, and provider cancellation limits.
- [x] 4.4 Add explicit fresh-authentication continuation behavior for eligible interrupted tasks without silently extending expired contexts or replaying completed destructive steps.

## 5. Foundation: frontend and migration checkpoint

- [x] 5.1 Adapt session response types and login state to canonical identity and provider discovery while retaining the existing static login form and appearance controls.
- [x] 5.2 Drive storage controls from effective actions, retain login on 403, and implement an accessible authenticated no-storage-access state.
- [x] 5.3 Preserve 401/logout cleanup for private state, upload activity, pasteboard synchronization, and analytical workers; describe logout as local.
- [x] 5.4 Write migration examples preserving legacy OR selectors, explicit access for previously unrestricted roots, static passwords, and existing personal home locations; reject mixed schema versions.
- [x] 5.5 Update canonical configuration, base Helm values, Compose examples, WASM demo, and auth/security documentation to explicit static authentication and declared grants.
- [x] 5.6 Verify the foundation's access matrix with representative static users and all action classes; run backend tests and frontend type/build/test checks plus deployment/documentation validation.
- [x] 5.7 Verify login, denied actions, no-access state, and logout in the in-app browser across desktop/mobile widths and supported themes, including keyboard focus, stable loading dimensions, hover behavior, clipping, and overflow.

## 6. OIDC: provider implementation after the foundation

- [x] 6.1 Select and pin maintained Go OIDC/OAuth libraries; implement configured discovery, client authentication, bounded networking, and provider availability reporting.
- [x] 6.2 Implement same-origin login initiation, protected expiring transactions, state/nonce, PKCE S256, configured callback URLs, and safe local return paths.
- [x] 6.3 Implement callback exchange and full identity validation; cover wrong signature/algorithm/issuer/audience/authorized party/nonce, missing subject, code replay, and mismatched UserInfo identity.
- [x] 6.4 Build minimal bounded external evidence sessions and reapply current group mappings/bindings per request; test claim-path changes, stale membership limits, and oversize-cookie rejection.
- [x] 6.5 Add SSO actions alongside static login and accessible callback/outage feedback using existing controls and responsive styling; verify no provider tokens enter frontend state or logs.

## 7. OIDC: integration and release verification

- [x] 7.1 Add a reproducible local Keycloak configuration/example with engineering membership mapping and both static and OIDC providers enabled.
- [x] 7.2 Verify end-to-end static/SSO login, denied consent, superseded transactions, provider outage, JWKS rotation, expiry, local logout, zero-grant users, and cross-provider task isolation.
- [x] 7.3 Verify equivalent effective permissions for static and OIDC members of the same application group, including source/destination transfer restrictions and read-only accounts.
- [x] 7.4 Exercise SSO redirect/callback, browser history cleanup, mutation-origin protection, cookies, and accessibility in the in-app browser across desktop/mobile and supported themes.
- [x] 7.5 Document session freshness, no immediate IdP revocation, local-only logout, task expiry/continuation, explicit home reassignment, and coordinated binary/config migration/rollback.
- [x] 7.6 Run the relevant complete backend/frontend/deployment/documentation checks and OpenSpec validation; reconcile requirements with actual verified behavior before archiving.

## Implementation decisions and remaining verification

- UserInfo is unused: mapped claims must be in the verified ID token; there is no ambiguous cross-subject merge.
- Explicit home keys must be globally unique. Deliberate sharing uses separate shared roots; duplicate-key exceptions are not implemented.
- Fresh continuation is supported for blocked conflict decisions. Transfers with prior effects require new requests for remaining work; canceled downloads/partial jobs are not replayed.
- Each model now has a linked reference, guide, architecture description, and migration example under `docs/`.
- Live Keycloak browser checks passed after starting the disposable local example. Protocol rejection, key rotation, and transaction edge cases are covered by the automated fixture. See [verification evidence](verification.md) for the exact coverage and release verification.
