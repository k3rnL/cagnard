## ADDED Requirements

### Requirement: Static user credential verifier material
Cagnard SHALL treat static-user password verifier material as secret or sensitive configuration and SHALL avoid storing plaintext passwords in application state.

#### Scenario: Configure password verifier
- **WHEN** a static user is configured for password login
- **THEN** Cagnard SHALL use verifier material such as a password hash or external secret reference rather than requiring a plaintext password field

#### Scenario: Resolve verifier from external source
- **WHEN** a configured static user references verifier material through environment substitution or mounted secret source
- **THEN** Cagnard SHALL resolve that material at runtime without writing it to backend-local persistent storage

#### Scenario: Avoid verifier disclosure
- **WHEN** static-user authentication fails or configuration diagnostics are reported
- **THEN** Cagnard SHALL omit plaintext passwords, submitted credentials, and full verifier material from logs and user-visible diagnostics

### Requirement: Authentication failure privacy
Cagnard SHALL report static-user login failures without enabling user enumeration or credential probing.

#### Scenario: Unknown user login failure
- **WHEN** a login request uses an unknown static username
- **THEN** Cagnard SHALL return the same safe failure category used for invalid static credentials

#### Scenario: Invalid password login failure
- **WHEN** a login request uses an invalid password for a known static user
- **THEN** Cagnard SHALL return the same safe failure category used for unknown static users

#### Scenario: Audit safe login outcome
- **WHEN** a static-user login attempt succeeds or fails
- **THEN** Cagnard SHALL be able to emit an audit-safe event without recording submitted password material

### Requirement: Auth provider credential boundary
Cagnard SHALL keep authentication-provider credential handling separate from storage-provider credential handling while exposing only normalized principal data to downstream authorization.

#### Scenario: Static auth provider returns principal
- **WHEN** static-user authentication succeeds
- **THEN** Cagnard SHALL pass downstream services a normalized principal and SHALL NOT expose static password verifier material to storage plugins or UI plugins

#### Scenario: Future OIDC provider returns principal
- **WHEN** a future OIDC provider authenticates a user
- **THEN** Cagnard SHALL pass downstream services the same normalized principal shape without requiring storage authorization code to know the original auth provider type
