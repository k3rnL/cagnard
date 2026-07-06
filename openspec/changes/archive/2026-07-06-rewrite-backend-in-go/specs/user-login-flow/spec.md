## MODIFIED Requirements

### Requirement: Static user login
Cagnard SHALL preserve static configured-user login behavior in the Go backend.

#### Scenario: Authenticate compatible verifier
- **WHEN** a configured static user has password verifier material accepted by the Scala backend
- **THEN** the Go backend SHALL authenticate the same valid password and reject invalid passwords with the same public failure behavior

#### Scenario: Reject disabled static login
- **WHEN** static-user login is disabled in configuration
- **THEN** the Go backend SHALL reject static login attempts without authenticating the submitted user

### Requirement: Stateless browser session
Cagnard SHALL preserve stateless signed browser session behavior in the Go backend.

#### Scenario: Issue compatible session cookie
- **WHEN** static login succeeds
- **THEN** the Go backend SHALL set a browser session cookie using the configured cookie name, secure flag, lifetime, and signing secret policy

#### Scenario: Verify session cookie
- **WHEN** a protected API request presents a valid Go-issued session cookie
- **THEN** the Go backend SHALL resolve the authenticated configured user from runtime configuration

#### Scenario: Reject missing or invalid session
- **WHEN** a protected API request has no valid session cookie
- **THEN** the Go backend SHALL return unauthorized without falling back to `auth.defaultUser` in static mode

### Requirement: Authentication provider discovery
Cagnard SHALL preserve auth provider discovery shape in the Go backend.

#### Scenario: Discover static provider
- **WHEN** static login is enabled
- **THEN** the Go backend SHALL expose provider id, label, kind, login method, credential fields, and capabilities in the same shape as the Scala backend

#### Scenario: Preserve future SSO extension point
- **WHEN** future OIDC or SSO provider configuration is introduced
- **THEN** the Go auth model SHALL be able to represent those providers without changing the storage browser contract
