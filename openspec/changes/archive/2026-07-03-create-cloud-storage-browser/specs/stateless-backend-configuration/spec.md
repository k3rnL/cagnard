## ADDED Requirements

### Requirement: Configuration as runtime source of truth
Cagnard SHALL run the backend with configuration and external providers as the required source of runtime state, without requiring an application database to start or serve requests.

#### Scenario: Start from configuration only
- **WHEN** the backend starts with a valid configuration file and required external dependencies are reachable
- **THEN** Cagnard SHALL be able to serve configured providers, users, access policies, and UI plugin declarations without running schema migrations or loading application database state

#### Scenario: Reject missing required configuration
- **WHEN** required provider, identity, or access configuration is missing
- **THEN** Cagnard SHALL fail startup or disable the affected feature with explicit diagnostics

### Requirement: Stateless request handling
Cagnard SHALL avoid storing required user, session, provider, or access-control state in backend-local persistent storage.

#### Scenario: Restart backend
- **WHEN** the backend restarts with the same configuration
- **THEN** Cagnard SHALL recover the same configured providers, users, access policies, and plugin registrations

#### Scenario: Scale backend replicas
- **WHEN** multiple backend replicas run with the same configuration
- **THEN** each replica SHALL authorize and route requests consistently without sharing application database state

### Requirement: External identity provider authentication
Cagnard SHALL support external authentication providers, including OIDC-compatible providers such as Keycloak, as the preferred user authentication mechanism.

#### Scenario: Authenticate through OIDC
- **WHEN** a request presents a valid token from a configured OIDC provider
- **THEN** Cagnard SHALL authenticate the user from validated token claims

#### Scenario: Reject invalid token
- **WHEN** a request presents an expired, invalid, or untrusted token
- **THEN** Cagnard SHALL reject the request without creating local user state

### Requirement: Simple configured users
Cagnard SHALL support simple user declarations in configuration for deployments that do not require an external identity provider.

#### Scenario: Use configured user declaration
- **WHEN** the configuration declares a simple user with roles or access rules
- **THEN** Cagnard SHALL authorize that user according to the configured declaration

#### Scenario: Disable configured users
- **WHEN** configured users are not enabled
- **THEN** Cagnard SHALL not accept simple configured-user authentication

### Requirement: Configuration-defined authorization
Cagnard SHALL derive user roles, groups, storage access rules, and plugin permissions from configuration and externally supplied identity claims.

#### Scenario: Map OIDC group to role
- **WHEN** a validated token contains a group claim mapped by configuration
- **THEN** Cagnard SHALL grant the configured role and storage access for that group

#### Scenario: Change authorization by configuration
- **WHEN** an administrator changes the configuration and the backend reloads or restarts
- **THEN** Cagnard SHALL apply the new authorization rules without database migration

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
