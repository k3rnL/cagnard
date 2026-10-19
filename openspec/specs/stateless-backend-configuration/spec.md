## Purpose

Defines configuration-driven backend operation without required application database state.
## Requirements
### Requirement: Configuration as runtime source of truth
Cagnard SHALL run the backend with configuration and external providers as the required source of runtime state, without requiring an application database to start or serve requests.

#### Scenario: Start from configuration only
- **WHEN** the backend starts with a valid configuration file and required external dependencies are reachable
- **THEN** Cagnard SHALL be able to serve configured providers, users, and access policies without running schema migrations or loading application database state

#### Scenario: Reject missing required configuration
- **WHEN** required provider, identity, or access configuration is missing
- **THEN** Cagnard SHALL fail startup or disable the affected feature with explicit diagnostics

#### Scenario: Reject removed UI plugin configuration
- **WHEN** backend configuration contains the removed top-level `uiPlugins` section
- **THEN** Cagnard SHALL fail startup with a diagnostic directing the operator to remove that section and use shipped first-party openers

### Requirement: Stateless request handling
Cagnard SHALL avoid storing required user, session, provider, or access-control state in backend-local persistent storage.

#### Scenario: Restart backend
- **WHEN** the backend restarts with the same configuration
- **THEN** Cagnard SHALL recover the same configured providers, users, and access policies

#### Scenario: Scale backend replicas
- **WHEN** multiple backend replicas run with the same configuration
- **THEN** each replica SHALL authorize and route requests consistently without sharing application database state

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

### Requirement: No required local audit database
Cagnard SHALL not require a local audit database for core operation and SHALL allow audit events to be emitted to logs, files, or external sinks configured by the administrator.

#### Scenario: Emit audit to configured sink
- **WHEN** an auditable operation completes
- **THEN** Cagnard SHALL emit the audit event to the configured sink without requiring a backend-local database

#### Scenario: Missing audit sink
- **WHEN** audit is required by policy and no audit sink is configured
- **THEN** Cagnard SHALL fail startup or disable audited operations according to policy

### Requirement: Secret material externalization
Cagnard SHALL support secret values through environment variables, mounted files, external secret providers, or delegated identity, rather than requiring secrets to be written into backend persistent state.

#### Scenario: Resolve secret from environment
- **WHEN** a provider account references a secret environment variable
- **THEN** Cagnard SHALL read the secret at runtime and SHALL not write it to application storage

#### Scenario: Resolve secret from mounted file
- **WHEN** a provider account references a mounted secret file
- **THEN** Cagnard SHALL read the secret at runtime and SHALL not expose its value to the UI

### Requirement: HOCON runtime configuration
Cagnard SHALL use HOCON as the primary backend runtime configuration format while preserving configuration as the stateless source of truth.

#### Scenario: Start from HOCON configuration
- **WHEN** the backend starts with a valid HOCON configuration file
- **THEN** Cagnard SHALL load server, auth, users, providers, accounts, and storage roots from that file without requiring application database state

#### Scenario: Use HOCON comments and includes
- **WHEN** the configuration uses HOCON comments or includes
- **THEN** Cagnard SHALL parse the effective resolved configuration before constructing the backend model

#### Scenario: Resolve environment or system substitutions
- **WHEN** the configuration contains supported HOCON substitutions for deployment-specific values
- **THEN** Cagnard SHALL resolve those values at startup or fail with explicit diagnostics

### Requirement: Canonical HOCON example
Cagnard SHALL provide a canonical HOCON example configuration for local development and operator onboarding.

#### Scenario: Default example path
- **WHEN** the backend starts without a config path argument or `CAGNARD_CONFIG`
- **THEN** Cagnard SHALL look for the canonical HOCON example configuration path

#### Scenario: Override config path
- **WHEN** `CAGNARD_CONFIG` or a backend argument provides a configuration path
- **THEN** Cagnard SHALL load that HOCON file instead of the default example

#### Scenario: Resolve relative storage paths
- **WHEN** a storage root path in the HOCON file is relative
- **THEN** Cagnard SHALL resolve it relative to the configuration file location

### Requirement: Configuration diagnostics
Cagnard SHALL report configuration parsing, resolution, and decoding failures with enough context for an operator to identify the file and invalid setting.

#### Scenario: Invalid HOCON syntax
- **WHEN** the backend starts with invalid HOCON syntax
- **THEN** Cagnard SHALL fail startup with a diagnostic that names the configuration file

#### Scenario: Invalid typed configuration
- **WHEN** the HOCON is syntactically valid but cannot decode to the backend configuration model
- **THEN** Cagnard SHALL fail startup with a diagnostic that names the configuration file and decode problem

### Requirement: Container supplied configuration
Cagnard SHALL support containerized deployments where backend configuration is supplied at runtime through mounted HOCON files and externalized secret sources.

#### Scenario: Load mounted container configuration
- **WHEN** the backend container starts with `CAGNARD_CONFIG` pointing to a mounted HOCON file
- **THEN** Cagnard SHALL load server, auth, users, providers, accounts, and storage roots from that file without requiring image rebuilds

#### Scenario: Use Kubernetes secret references
- **WHEN** deployment configuration references environment variables or mounted files populated from Kubernetes Secrets
- **THEN** Cagnard SHALL resolve those values at startup without writing secret material into backend-local persistent state

### Requirement: Helm configuration source
Cagnard SHALL let Helm deployments choose how backend HOCON configuration is provided without forcing secrets into chart source.

#### Scenario: Render inline non-secret config
- **WHEN** Helm values provide non-secret HOCON configuration for local or demo deployment
- **THEN** the chart SHALL render a ConfigMap and mount it for the backend container

#### Scenario: Use existing config secret
- **WHEN** Helm values reference an existing Kubernetes Secret or volume containing the HOCON configuration
- **THEN** the chart SHALL mount that external source instead of rendering sensitive configuration into a ConfigMap

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

### Requirement: Stateless appearance configuration
Cagnard SHALL support optional application appearance defaults through HOCON configuration without requiring persistent backend state.

#### Scenario: Use default appearance configuration
- **WHEN** no appearance section is configured
- **THEN** Cagnard SHALL default to the Classic palette, system mode, and enabled user overrides

#### Scenario: Configure appearance defaults
- **WHEN** an administrator configures a supported default palette and mode
- **THEN** Cagnard SHALL expose those defaults to the frontend for the login screen and authenticated application shell

#### Scenario: Configure user override policy
- **WHEN** an administrator disables user appearance overrides
- **THEN** Cagnard SHALL expose the configured palette and mode as locked frontend appearance settings

#### Scenario: Reject invalid appearance values
- **WHEN** the configured palette or mode is not supported
- **THEN** Cagnard SHALL fail startup with a diagnostic that identifies the invalid appearance setting

### Requirement: Public appearance discovery
Cagnard SHALL expose only non-sensitive appearance configuration through an unauthenticated discovery response so the login screen can apply operator defaults.

#### Scenario: Load appearance before login
- **WHEN** the frontend starts without an authenticated session
- **THEN** it SHALL be able to retrieve default palette, default mode, and user-override policy without receiving users, credentials, storage roots, or other protected configuration

#### Scenario: Restart with same appearance
- **WHEN** stateless backend replicas restart with the same HOCON configuration
- **THEN** each replica SHALL return the same appearance discovery response without shared application state

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
