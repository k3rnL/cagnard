## Purpose

Defines stateless account, credential reference, permission, confirmation, and audit behavior.
## Requirements
### Requirement: Multiple accounts per provider
Cagnard SHALL allow administrators to declare, identify, enable, disable, and remove multiple storage accounts for the same provider family through configuration.

#### Scenario: Declare multiple provider accounts
- **WHEN** the configuration declares two accounts for the same provider family
- **THEN** Cagnard SHALL expose them as separate account contexts

#### Scenario: Disable account
- **WHEN** the configuration disables an account
- **THEN** Cagnard SHALL prevent new browsing, operation, and transfer sessions from using that account

### Requirement: Plugin-declared authentication schemes
Cagnard SHALL support authentication schemes declared by storage plugins, including delegated identity, access keys, SSH keys, local filesystem permissions, and provider-specific credential references.

#### Scenario: Delegated identity provider
- **WHEN** a plugin declares support for delegated identity
- **THEN** Cagnard SHALL use the authenticated user's externally supplied claims or tokens according to configured policy

#### Scenario: Unix filesystem provider
- **WHEN** the Unix filesystem plugin uses local process permissions instead of stored remote credentials
- **THEN** Cagnard SHALL represent that authentication mode explicitly in the account configuration

### Requirement: Stateless credential references
Cagnard SHALL avoid requiring a local credential database and SHALL resolve storage credentials from configuration, environment variables, mounted secret files, or external identity providers.

#### Scenario: Resolve configured secret reference
- **WHEN** a storage account references a secret by environment variable or mounted file
- **THEN** Cagnard SHALL resolve the secret at runtime without persisting it to application storage

#### Scenario: Use external identity token
- **WHEN** a storage account is configured to use the authenticated user's external identity token
- **THEN** Cagnard SHALL derive provider access from that token according to configured policy

#### Scenario: Avoid secret logging
- **WHEN** authentication, browsing, transfer, or plugin operations fail
- **THEN** Cagnard SHALL omit secrets and credential-derived values from logs and user-visible diagnostics

### Requirement: Credential access boundaries
Cagnard SHALL provide plugins only the credential access necessary for an authorized operation and SHALL prevent the primary UI from directly reading raw secrets.

#### Scenario: Invoke plugin operation with credential handle
- **WHEN** Cagnard invokes a provider operation that requires authentication
- **THEN** Cagnard SHALL supply the plugin with a scoped credential handle or scoped token rather than exposing unrelated account secrets

#### Scenario: Block UI secret access
- **WHEN** the browser UI renders account or operation state
- **THEN** Cagnard SHALL provide redacted credential metadata instead of raw credential values

### Requirement: Account permissions and operation policy
Cagnard SHALL enforce configured account permissions, read-only modes, user claim rules, and operation policies before browsing, mutation, or transfer operations are executed.

#### Scenario: Read-only account blocks mutation
- **WHEN** an account is configured as read-only
- **THEN** Cagnard SHALL block upload, create folder, rename, copy, move, delete, and source-delete phases of transfer operations for that account

#### Scenario: Read-only account blocks provider write
- **WHEN** the active account is read-only and the user requests a write operation
- **THEN** Cagnard SHALL reject the operation before invoking the provider write

#### Scenario: Writable account allows authorized mutation
- **WHEN** the active account is writable and the user is authorized for the storage root
- **THEN** Cagnard SHALL allow the provider operation to run subject to provider capability checks

#### Scenario: Claim rule filters account
- **WHEN** the authenticated user's claims do not satisfy an account's access rule
- **THEN** Cagnard SHALL hide or deny access to that account according to configured policy

#### Scenario: Policy blocks public sharing change
- **WHEN** an operation would create or modify public access
- **THEN** Cagnard SHALL require an explicit policy allowance before executing the operation

### Requirement: Sensitive operation confirmation
Cagnard SHALL require confirmation or configured policy approval for destructive, bulk, overwrite, permission-changing, or public-access operations.

#### Scenario: Confirm bulk delete
- **WHEN** the user requests deletion of multiple entries
- **THEN** Cagnard SHALL require confirmation before executing the delete operation

#### Scenario: Confirm overwrite
- **WHEN** a transfer or upload would overwrite an existing destination entry
- **THEN** Cagnard SHALL require an overwrite policy or explicit confirmation before writing

#### Scenario: Missing delete confirmation
- **WHEN** a delete request does not include confirmation
- **THEN** Cagnard SHALL reject the request without deleting the entry

#### Scenario: Missing overwrite approval
- **WHEN** an upload, copy, or move would overwrite an existing target without overwrite approval
- **THEN** Cagnard SHALL reject the operation without modifying the target

### Requirement: Security audit trail
Cagnard SHALL record security-relevant events for account changes, credential changes, permission-impacting operations, destructive operations, and cross-provider transfers.

#### Scenario: Audit configured account use
- **WHEN** an operation uses a configured storage account
- **THEN** Cagnard SHALL record the account identifier, provider family, actor, time, and action without recording raw secrets

#### Scenario: Audit destructive operation
- **WHEN** Cagnard executes delete or source-delete as part of a move
- **THEN** Cagnard SHALL record the account context, storage reference, actor, time, requested operation, and operation result

### Requirement: Secret rotation and session cleanup
Cagnard SHALL support secret rotation through configuration or external identity providers and SHALL stop future operations from using revoked or invalid credentials.

#### Scenario: Rotate configured credential reference
- **WHEN** the administrator changes a configured credential reference or the external provider revokes a credential
- **THEN** Cagnard SHALL stop future operations from using the old credential material

#### Scenario: Active operation after revocation
- **WHEN** credentials are revoked while an operation is active
- **THEN** Cagnard SHALL stop or fail subsequent provider calls that require the revoked credential and report the resulting operation state

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
