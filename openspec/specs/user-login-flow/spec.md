# user-login-flow Specification

## Purpose
TBD - created by archiving change add-user-login-static-users. Update Purpose after archive.
## Requirements
### Requirement: Authentication provider discovery
Cagnard SHALL expose enabled authentication providers through a provider-neutral discovery API so static and OIDC login can coexist without changing storage-browser contracts.

#### Scenario: Discover static provider
- **WHEN** a static provider is enabled
- **THEN** discovery SHALL describe its ID, label, fields, and login action

#### Scenario: Discover external provider
- **WHEN** an implemented OIDC provider is enabled
- **THEN** discovery SHALL describe its ID, label, login initiation action, and availability without exposing client secrets

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
Cagnard SHALL issue and verify versioned authenticated-encryption browser session cookies without requiring persistent backend session storage. Static and OIDC login SHALL share the same session service. Session integrity, expiry, identity shape, and current provider configuration SHALL be checked on every protected request.

#### Scenario: Issue session after login
- **WHEN** static or OIDC authentication succeeds
- **THEN** Cagnard SHALL issue an HttpOnly SameSite=Lax session scoped to the authenticated provider and subject, using Secure cookies for production HTTPS

#### Scenario: Resolve session on API request
- **WHEN** a request presents a valid session
- **THEN** Cagnard SHALL resolve current static-user data or validated external session evidence and apply current authorization configuration before serving the request

#### Scenario: Reject missing session
- **WHEN** a protected request does not present a valid session outside explicit development mode
- **THEN** Cagnard SHALL return unauthorized without implicit default-user fallback

#### Scenario: Expire session
- **WHEN** a session is expired, malformed, from an old format, or protected by an untrusted key
- **THEN** Cagnard SHALL reject it and require authentication again

#### Scenario: Invalidate changed static credentials
- **WHEN** the configured static user is disabled, removed, or has changed verifier material after configuration restart
- **THEN** existing sessions for that user SHALL fail validation

### Requirement: Logout
Cagnard SHALL provide idempotent local logout that removes the browser's application credential and private UI state. Local logout SHALL NOT be presented as identity-provider logout, individual stateless-token revocation, or automatic cancellation of accepted background work.

#### Scenario: Logout current session
- **WHEN** the user logs out
- **THEN** Cagnard SHALL clear the application cookie, shut down private browser work, and make subsequent requests without a valid credential unauthorized

#### Scenario: Logout without active session
- **WHEN** logout is requested without an active session
- **THEN** Cagnard SHALL return a successful idempotent response without creating user state

### Requirement: Frontend authentication shell
Cagnard SHALL gate storage browsing behind explicit authentication and render available static and OIDC choices through one integrated login screen.

#### Scenario: Show login before browser
- **WHEN** startup session discovery reports no authenticated principal
- **THEN** the frontend SHALL display available login providers instead of protected browser content

#### Scenario: Enter browser after login
- **WHEN** login succeeds
- **THEN** the frontend SHALL load session, authorized navigation, and owner-scoped tasks, or show an authenticated no-access state

#### Scenario: Handle session loss
- **WHEN** a protected request reports 401
- **THEN** the frontend SHALL clear private state, stop analytical workers, and return to login

#### Scenario: Integrated accessible login
- **WHEN** login choices, loading state, or errors render across supported themes and desktop/mobile sizes
- **THEN** controls SHALL preserve existing styling, keyboard focus, readable labels, stable loading dimensions, and freedom from clipping or horizontal overflow

### Requirement: Provider-neutral authenticated principal
Cagnard SHALL represent every authenticated identity using a canonical provider-qualified principal containing stable identity, display attributes, normalized application groups, and authentication context. Cagnard SHALL preserve provider and subject information through authorization and task ownership. Scoped role grants SHALL be computed by authorization rather than embedded as global principal roles.

#### Scenario: Static user principal
- **WHEN** a configured static user authenticates
- **THEN** the principal SHALL identify the configured provider and immutable user ID and resolve its declared groups from current configuration

#### Scenario: External principal
- **WHEN** an OIDC user authenticates
- **THEN** the principal SHALL identify the configured provider, verified issuer, and subject, with memberships obtained through explicit mappings

#### Scenario: Identity collision
- **WHEN** two providers or issuers have the same subject, username, or email
- **THEN** their principal IDs and task ownership SHALL remain distinct unless a separate explicit linking feature is introduced

### Requirement: Same-origin browser mutations
Cagnard SHALL require the configured origin and an application-specific request header for browser state-changing endpoints, including static login, logout, upload, and OIDC start. OIDC callback SHALL use its separate validated transaction contract. Cookie SameSite alone SHALL NOT be the mutation protection mechanism.

#### Scenario: Cross-origin mutation
- **WHEN** a browser mutation has a missing or mismatched Origin or lacks the required request header
- **THEN** Cagnard SHALL reject it before authentication state changes or storage mutations
