## MODIFIED Requirements

### Requirement: External identity provider authentication
Cagnard SHALL support configured OIDC providers through a validated browser authorization-code flow and common application sessions without requiring a local user database.

#### Scenario: Authenticate through OIDC
- **WHEN** a browser completes a valid transaction with an enabled OIDC provider
- **THEN** Cagnard SHALL derive identity from verified provider data and issue an application session

#### Scenario: Reject invalid token
- **WHEN** external token verification or transaction validation fails
- **THEN** Cagnard SHALL reject authentication without returning a partial principal or creating local user state

### Requirement: Simple configured users
Cagnard SHALL support provider-scoped static user declarations with verifier material, enabled state, declared application-group membership, and optional storage keys for deployments needing local login.

#### Scenario: Use configured user declaration
- **WHEN** a static user's declared group is bound to a role on a storage root
- **THEN** Cagnard SHALL grant only that role's actions on that scope

#### Scenario: Authenticate configured user
- **WHEN** an enabled static user presents valid credentials to its enabled provider
- **THEN** Cagnard SHALL authenticate without creating application database state

#### Scenario: Static login requires credentials
- **WHEN** a protected request lacks a valid session
- **THEN** configured static users SHALL NOT enable default-user fallback

### Requirement: Configuration-defined authorization
Cagnard SHALL derive application memberships, role action sets, and scoped grants from declared configuration and explicitly mapped validated external evidence. Invalid references SHALL fail startup, and changes SHALL apply after configuration restart without a database migration.

#### Scenario: Map OIDC group to role
- **WHEN** a validated external group maps to a declared application group with a scoped role binding
- **THEN** Cagnard SHALL grant that role's actions only on the bound resources

#### Scenario: Change authorization by configuration
- **WHEN** an administrator changes a role, mapping, or binding and restarts the backend
- **THEN** subsequent permission checks SHALL use the changed configuration, subject to documented external-evidence freshness

### Requirement: Authentication mode configuration
Cagnard SHALL use an explicit versioned provider registry permitting multiple static/OIDC providers, with development identity configured separately and mutually exclusively. Missing authentication configuration SHALL fail startup. Unsupported provider types SHALL fail startup rather than accepting placeholder identity data.

#### Scenario: Enable static login mode
- **WHEN** configuration enables a static provider
- **THEN** the backend SHALL offer explicit static login and require valid authentication for protected browser routes

#### Scenario: Enable development identity mode
- **WHEN** development identity is explicitly enabled without production providers
- **THEN** the backend SHALL accept only its explicit configured development identities and SHALL NOT decode unverified bearer tokens

#### Scenario: Configure unsupported provider type
- **WHEN** an authentication provider has an unsupported type
- **THEN** startup SHALL fail with an unsupported-provider diagnostic without fallback

#### Scenario: Enable multiple providers
- **WHEN** implemented static and OIDC providers are enabled together
- **THEN** both SHALL feed the same principal, session, and authorization contracts

### Requirement: Stateless session signing configuration
Cagnard SHALL require externalized cryptographic key material for authenticated-encryption session cookies and SHALL validate key shape, session lifetime, cookie options, and public-origin configuration at startup.

#### Scenario: Resolve session signing secret
- **WHEN** browser sessions are enabled
- **THEN** Cagnard SHALL resolve the session protection key from configured secret material without persisting it to an application database

#### Scenario: Reject missing signing secret
- **WHEN** the protection key is missing or invalid
- **THEN** startup SHALL fail with a safe diagnostic

#### Scenario: Configure session lifetime
- **WHEN** a positive session lifetime is configured
- **THEN** it SHALL bound the absolute application session lifetime without silent renewal

## ADDED Requirements

### Requirement: Explicit legacy auth migration
Cagnard SHALL reject mixed legacy and version-two authentication/authorization fields and provide migration documentation preserving intended access and personal storage locations. Deployment examples SHALL explicitly select supported authentication behavior.

#### Scenario: Preserve old OR grants
- **WHEN** old allowedUsers, allowedRoles, and allowedGroups rules are migrated
- **THEN** the migration guidance SHALL express each matching alternative as a scoped grant without turning old role labels into implicit action roles

#### Scenario: Preserve previously unrestricted root deliberately
- **WHEN** a root formerly had no selectors
- **THEN** migration guidance SHALL require an explicit authenticated binding to preserve that access

#### Scenario: Base deployment configuration
- **WHEN** the maintained base Helm or Compose example starts
- **THEN** it SHALL use explicitly configured authentication rather than an omitted-mode default-user fallback
