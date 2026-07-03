## ADDED Requirements

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

## MODIFIED Requirements

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
