# centralized-authorization Specification

## Purpose
Defines declared groups, scoped action grants, shared enforcement, and safe storage identity for every login provider.
## Requirements
### Requirement: Declared groups roles and scoped bindings
Cagnard SHALL declare application groups as membership sets, roles as explicit action sets, and bindings as role grants to groups or provider-qualified principals on explicit tunnel/root scopes. Cagnard SHALL reject unknown references, duplicate identifiers, unknown actions, and empty grants at startup. Cagnard SHALL provide no implicit privilege for any role or group name.

#### Scenario: Same user has different roles on different roots
- **WHEN** Alice is bound to editor on global/shared and reader on global/archive
- **THEN** Alice SHALL receive each role's declared actions only on its bound root

#### Scenario: Invalid declaration
- **WHEN** a binding references an undeclared group, role, provider, or root
- **THEN** startup SHALL fail with a diagnostic identifying the invalid reference without exposing secrets

#### Scenario: No implicit administrator
- **WHEN** an authenticated identity has an external group or role named admin without a configured mapping and binding
- **THEN** that value SHALL grant no storage permission

### Requirement: Explicit membership normalization
Cagnard SHALL resolve static membership from declared application group references and external membership from provider-scoped mappings of validated claim values. Claim paths SHALL use JSON Pointer. Cagnard SHALL NOT assign application roles directly from an external claim or a static user's legacy role labels.

#### Scenario: Shared application group
- **WHEN** a static user belongs to engineering and a validated OIDC group is explicitly mapped to engineering
- **THEN** both identities SHALL receive the engineering group's bound permissions under the same evaluator

#### Scenario: Unknown or invalid external membership
- **WHEN** a selected external membership claim contains unmapped values or is absent
- **THEN** those values SHALL grant nothing and absence SHALL produce no membership
- **AND** a present membership claim with an invalid type SHALL fail authentication

### Requirement: Default deny and additive grants
Cagnard SHALL deny access without a matching binding, combine matching grants additively, and require an explicit authenticated subject to grant access to all authenticated users. An empty selector SHALL NOT grant access. Account read-only restrictions and unsupported provider capabilities SHALL restrict effective operations regardless of role grants.

#### Scenario: Root without bindings
- **WHEN** a valid user requests a root without a matching binding
- **THEN** the root SHALL be absent from navigation and unavailable through direct API access

#### Scenario: Account ceiling
- **WHEN** a role grants write and delete on a root whose account is read-only
- **THEN** both actions SHALL remain denied before any provider mutation is invoked

### Requirement: Central operation authorization
Cagnard SHALL authenticate protected requests before storage execution and use one authorization service for navigation, direct operations, structured-data facades, watch streams, transfers, and task execution. Effective actions SHALL be derived from the same decisions used by backend enforcement. Providers SHALL NOT interpret authentication-provider roles or claims.

#### Scenario: Frontend restriction cannot be bypassed
- **WHEN** a user without delete permission calls a delete endpoint directly
- **THEN** the backend SHALL deny it without invoking provider deletion, regardless of frontend state

#### Scenario: Secondary content paths
- **WHEN** a user requests an archive member, content range, Iceberg object, or watch stream
- **THEN** the backend SHALL check the same root read permission used for ordinary file reads

### Requirement: Operation permission composition
Cagnard SHALL define list, read, write, mkdir, rename, and delete actions. Copy SHALL require source read and destination write; move SHALL additionally require source delete; directory creation SHALL require destination mkdir. Rename SHALL require rename permission and destination write when replacement is requested. Overwrite and destructive confirmations SHALL remain additional requirements, not substitutes for permission.

#### Scenario: Move denied while copy is allowed
- **WHEN** a user has source read and destination write but lacks source delete
- **THEN** copying a file SHALL be permitted and moving that file SHALL be denied before source removal

#### Scenario: Same-root optimized operation
- **WHEN** a provider supports an optimized copy or move within one root
- **THEN** Cagnard SHALL enforce the same composed permissions as for a streamed cross-provider operation

### Requirement: Consistent denial and permission presentation
Cagnard SHALL return 401 for invalid authentication, 403 for a denied action on a root accessible to that principal, and 404 for unavailable roots and foreign tasks. The frontend SHALL retain authenticated state on 403, render effective permitted actions with existing controls, and show an accessible no-storage-access state when no roots are granted.

#### Scenario: Permission failure preserves login
- **WHEN** an authenticated action receives 403
- **THEN** the UI SHALL show clear operation feedback without returning to the login screen

#### Scenario: Empty access and responsive controls
- **WHEN** a user has no authorized roots or permission controls are displayed on mobile, desktop, or a supported theme
- **THEN** text and sign-out controls SHALL remain visible and keyboard accessible without horizontal overflow, unstable loading dimensions, or hover-only explanations

### Requirement: Safe storage identity
Cagnard SHALL derive personal storage paths from an explicit validated storage key distinct from the canonical principal ID. Filesystem paths and S3 prefixes SHALL support the same storage-key placeholder. Arbitrary external claim values SHALL NOT be interpolated into storage targets.

#### Scenario: Preserve an existing home
- **WHEN** migration assigns storageKey alice to a configured identity
- **THEN** its home SHALL continue resolving to the intended alice directory without changing its canonical task-owner identity

#### Scenario: Invalid key or conflicting assignment
- **WHEN** an OIDC override key is empty, or a configured key contains traversal or separators or conflicts with another identity
- **THEN** configuration SHALL be rejected rather than broadening personal storage access; deliberate sharing SHALL use a separately configured shared root and bindings

#### Scenario: Safe default external home
- **WHEN** a previously unseen OIDC identity receives access to a templated personal root
- **THEN** its default storage key SHALL be a safe deterministic segment derived from its provider-qualified identity and SHALL remain confined to the configured base
