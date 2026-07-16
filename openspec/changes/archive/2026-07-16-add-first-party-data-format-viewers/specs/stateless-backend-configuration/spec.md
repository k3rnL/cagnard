## MODIFIED Requirements

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

### Requirement: Configuration-defined authorization
Cagnard SHALL derive user roles, groups, storage access rules, and storage operation permissions from configuration and externally supplied identity claims.

#### Scenario: Map OIDC group to role
- **WHEN** a validated token contains a group claim mapped by configuration
- **THEN** Cagnard SHALL grant the configured role and storage access for that group

#### Scenario: Change authorization by configuration
- **WHEN** an administrator changes the configuration and the backend reloads or restarts
- **THEN** Cagnard SHALL apply the new authorization rules without database migration

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

### Requirement: Container supplied configuration
Cagnard SHALL support containerized deployments where backend configuration is supplied at runtime through mounted HOCON files and externalized secret sources.

#### Scenario: Load mounted container configuration
- **WHEN** the backend container starts with `CAGNARD_CONFIG` pointing to a mounted HOCON file
- **THEN** Cagnard SHALL load server, auth, users, providers, accounts, and storage roots from that file without requiring image rebuilds

#### Scenario: Use Kubernetes secret references
- **WHEN** deployment configuration references environment variables or mounted files populated from Kubernetes Secrets
- **THEN** Cagnard SHALL resolve those values at startup without writing secret material into backend-local persistent state
