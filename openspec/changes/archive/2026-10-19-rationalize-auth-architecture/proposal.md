## Why

Cagnard's static login works, but identity information is discarded between authentication and authorization, root checks are duplicated, and roles/groups are undeclared labels. The external bearer placeholder is unsafe; a coherent identity, session, and permission model must precede production OIDC support.

## What Changes

- Retain static password login and introduce independently enabled authentication providers that produce one canonical, provider-qualified principal.
- Define groups as declared membership sets, roles as declared action sets, and bindings as role grants to groups or principals on explicit storage roots. External memberships require configured mappings.
- Centralize navigation filtering, operation permission checks, task ownership, and effective UI permissions around one authorization service with default-deny behavior.
- Keep storage credentials separate from end-user authentication and preserve account read-only restrictions as a ceiling on grants.
- Specify a backend-managed OIDC authorization-code flow with PKCE, validated identity, and the same application session used by static login.
- Preserve operation without a required user/session database. Document bounded external-claim freshness, session expiry, local logout, and background-operation behavior.
- **BREAKING**: Replace authentication mode switches and scattered enablement flags with a provider registry and explicit development mode; remove unverified bearer parsing and implicit development defaults.
- **BREAKING**: Replace `allowedUsers`, `allowedRoles`, `allowedGroups`, and direct static-user role labels with validated role bindings. Provide migration guidance preserving current access, usernames, and personal storage locations.
- **BREAKING**: Introduce versioned protected session cookies and stable principal IDs; require users to sign in again during migration and update API consumers to use effective root permissions.
- Reuse Cagnard's login components, controls, themes, and feedback patterns. Provider selection, callback errors, permission-based controls, and empty-access states must remain accessible, responsive, and visually consistent, without unstable layout or overlay regressions.

This proposal contains two implementation milestones: establish the shared foundation with static login first, then add OIDC against that foundation. This planning change does not implement either milestone.

## Capabilities

### New Capabilities

- `centralized-authorization`: Declared groups, roles, scoped bindings, permission composition, default deny, safe storage identities, and consistent enforcement.
- `oidc-browser-login`: Backend-managed OIDC sign-in, validation, identity mapping, transaction handling, session issuance, and error behavior.

### Modified Capabilities

- `user-login-flow`: Shared provider registry, canonical identity, common session lifecycle, and integrated multi-provider UI.
- `stateless-backend-configuration`: Explicit auth configuration, stateless OIDC evidence, strict validation, and legacy migration.
- `user-storage-access-model`: Explicit bindings, safe personal-root derivation, and action-aware navigation.
- `secure-account-management`: Role-based operation policy combined with account/provider restrictions and credential boundaries.
- `task-queue`: Provider-qualified ownership and bounded authorization for background work.

## Impact

- Backend: `internal/auth`, configuration models/loader, API route registration, storage access helpers, task execution, and storage-provider invocation boundaries. Separate authentication and authorization packages replace responsibilities concentrated in `UserResolver` and `AccessService`.
- Frontend: provider discovery/login, session state, API errors, permission-based actions, task ownership channels, and structured-data session cleanup.
- Contracts: authentication endpoints, session response identity, root effective permissions, denial status codes, and versioned HOCON configuration.
- Operations: canonical configuration, Compose/Helm examples, WASM demo, migration documentation, secret provisioning, and OIDC test deployment.
- Dependencies: vetted Go OIDC/OAuth and protected-cookie support, selected and pinned during implementation; no required session database or policy server.
