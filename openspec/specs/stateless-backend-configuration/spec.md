## Purpose

Defines configuration-driven backend operation without required application database state.
## Requirements
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
Cagnard SHALL support simple user declarations in configuration for deployments that do not require an external identity provider, and SHALL support authenticating those users through explicit static login when static login mode is enabled.

#### Scenario: Use configured user declaration
- **WHEN** the configuration declares a simple user with roles or access rules
- **THEN** Cagnard SHALL authorize that user according to the configured declaration

#### Scenario: Authenticate configured user
- **WHEN** static login mode is enabled and a configured user presents valid configured credentials
- **THEN** Cagnard SHALL authenticate the user without creating backend-local persistent user state

#### Scenario: Disable configured users
- **WHEN** configured users are not enabled
- **THEN** Cagnard SHALL not accept simple configured-user authentication

#### Scenario: Avoid implicit fallback in login mode
- **WHEN** static login mode is enabled and a request has no valid session
- **THEN** Cagnard SHALL reject the request instead of silently resolving `auth.defaultUser`

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

### Requirement: HOCON runtime configuration
Cagnard SHALL use HOCON as the primary backend runtime configuration format while preserving configuration as the stateless source of truth.

#### Scenario: Start from HOCON configuration
- **WHEN** the backend starts with a valid HOCON configuration file
- **THEN** Cagnard SHALL load server, auth, users, providers, accounts, storage roots, and UI plugin declarations from that file without requiring application database state

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
- **THEN** Cagnard SHALL load server, auth, users, providers, accounts, storage roots, and UI plugin declarations from that file without requiring image rebuilds

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
Cagnard SHALL let administrators choose the configured authentication mode without requiring application database state.

#### Scenario: Enable static login mode
- **WHEN** the backend starts with static login mode enabled
- **THEN** Cagnard SHALL require explicit login for protected browser API requests and SHALL authenticate configured users through the static auth provider

#### Scenario: Enable development identity mode
- **WHEN** the backend starts with development identity mode enabled
- **THEN** Cagnard MAY accept explicit development identity headers or configured default-user fallback for local development and tests

#### Scenario: Reserve external identity mode
- **WHEN** the backend starts with external identity mode configured for a future OIDC or SSO provider
- **THEN** Cagnard SHALL fail startup or mark the provider unavailable until the external provider implementation is present, without silently falling back to static login

### Requirement: Stateless session signing configuration
Cagnard SHALL require stateless session signing settings when login mode issues browser sessions.

#### Scenario: Resolve session signing secret
- **WHEN** static login mode is enabled
- **THEN** Cagnard SHALL resolve the session signing secret from configuration, environment substitution, mounted secret reference, or another externalized secret source

#### Scenario: Reject missing signing secret
- **WHEN** login mode requires signed sessions and no usable signing secret is configured
- **THEN** Cagnard SHALL fail startup with an explicit configuration diagnostic

#### Scenario: Configure session lifetime
- **WHEN** session lifetime settings are configured
- **THEN** Cagnard SHALL apply them when issuing stateless sessions

