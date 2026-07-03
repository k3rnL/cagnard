# user-login-flow Specification

## Purpose
TBD - created by archiving change add-user-login-static-users. Update Purpose after archive.
## Requirements
### Requirement: Authentication provider discovery
Cagnard SHALL expose enabled authentication providers through a provider-neutral discovery API so the frontend can render static-user login now and OIDC/SSO login options later without changing the storage browser contract.

#### Scenario: Discover static login provider
- **WHEN** static-user login is enabled in configuration
- **THEN** the auth provider discovery response SHALL include a static provider with provider id, display label, login method, and required credential fields

#### Scenario: Preserve future SSO provider shape
- **WHEN** a future OIDC or SSO provider is enabled
- **THEN** the discovery response SHALL be able to describe that provider without changing the static provider response shape

### Requirement: Static user login
Cagnard SHALL allow a configured static user to authenticate through an explicit login endpoint using configured credential verifier material.

#### Scenario: Login with valid static credentials
- **WHEN** a user submits a valid static-user login request
- **THEN** Cagnard SHALL authenticate the user and return a normalized authenticated session for that configured user

#### Scenario: Reject invalid static credentials
- **WHEN** a user submits an unknown username or invalid password
- **THEN** Cagnard SHALL reject the login request with a safe authentication failure that does not reveal which credential field was wrong

#### Scenario: Reject disabled static login
- **WHEN** static-user login is disabled in configuration
- **THEN** Cagnard SHALL reject static login attempts without authenticating the submitted user

### Requirement: Stateless browser session
Cagnard SHALL issue and verify browser sessions without requiring backend-local persistent session storage.

#### Scenario: Issue session after login
- **WHEN** static-user login succeeds
- **THEN** Cagnard SHALL issue a stateless signed session token scoped to the authenticated provider and subject

#### Scenario: Resolve session on API request
- **WHEN** an API request presents a valid session token
- **THEN** Cagnard SHALL resolve the current configured user and authorization data from runtime configuration before serving the request

#### Scenario: Reject missing session
- **WHEN** login is required and an API request does not present a valid session token
- **THEN** Cagnard SHALL return an unauthorized response without falling back to an implicit default user

#### Scenario: Expire session
- **WHEN** a session token is expired, malformed, or signed with an untrusted key
- **THEN** Cagnard SHALL reject the request and require the user to authenticate again

### Requirement: Logout
Cagnard SHALL provide logout behavior that removes the browser's current stateless session credential.

#### Scenario: Logout current session
- **WHEN** the user logs out
- **THEN** Cagnard SHALL instruct the browser to clear the session credential and subsequent protected API requests SHALL be unauthorized

#### Scenario: Logout without active session
- **WHEN** logout is requested without an active session
- **THEN** Cagnard SHALL return a successful idempotent logout response without creating user state

### Requirement: Frontend authentication shell
Cagnard SHALL gate the storage browser behind explicit authentication when login is required and SHALL keep the login UI provider-neutral.

#### Scenario: Show login before browser
- **WHEN** the frontend starts and the session endpoint reports no authenticated user
- **THEN** the frontend SHALL show the configured login providers instead of the storage browser

#### Scenario: Enter browser after login
- **WHEN** login succeeds
- **THEN** the frontend SHALL load session, navigation, storage entries, and UI plugins for the authenticated user

#### Scenario: Handle session loss
- **WHEN** a protected API request reports that the session is unauthorized
- **THEN** the frontend SHALL clear local session state and return the user to the login view

### Requirement: Provider-neutral authenticated principal
Cagnard SHALL represent authenticated users as a normalized principal independent of whether authentication came from static users, development mode, or future OIDC/SSO.

#### Scenario: Static user principal
- **WHEN** a static configured user authenticates
- **THEN** Cagnard SHALL produce an authenticated principal with provider id, subject, display name, roles, groups, and claims derived from configuration

#### Scenario: Future external principal
- **WHEN** a future OIDC or SSO provider authenticates a user
- **THEN** Cagnard SHALL be able to produce the same normalized principal shape for downstream authorization
