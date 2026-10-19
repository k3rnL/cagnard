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
Cagnard SHALL use the authentication schemes implemented by its configured storage providers. Filesystem access SHALL use local process permissions; S3 access SHALL use static account credentials, an AWS profile, or the AWS default credential chain. Browser OIDC tokens SHALL NOT be delegated to storage providers.

#### Scenario: Unsupported delegated identity
- **WHEN** an account requests an unsupported end-user token delegation mode
- **THEN** configuration SHALL be rejected rather than forwarding browser identity tokens

#### Scenario: Unix filesystem provider
- **WHEN** the Unix filesystem provider uses local process permissions
- **THEN** Cagnard SHALL represent that authentication mode explicitly in the account configuration

### Requirement: Stateless credential references
Cagnard SHALL avoid a local credential database and resolve storage credentials from startup configuration, environment substitutions, mounted configuration or AWS credential profiles, or the AWS default credential chain.

#### Scenario: Resolve configured secret reference
- **WHEN** a storage account uses credentials supplied by its supported configuration source
- **THEN** Cagnard SHALL resolve the credentials without persisting them to application storage

#### Scenario: Browser identity is not a storage credential
- **WHEN** a principal signs in through OIDC
- **THEN** storage access SHALL use the configured backend account credentials rather than the principal's ID or access token

#### Scenario: Avoid secret logging
- **WHEN** authentication, browsing, transfer, or provider operations fail
- **THEN** Cagnard SHALL omit secrets from logs and user-visible diagnostics

### Requirement: Credential access boundaries
Cagnard SHALL provide plugins only the credential access necessary for an authorized operation and SHALL prevent the primary UI from directly reading raw secrets.

#### Scenario: Invoke plugin operation with credential handle
- **WHEN** Cagnard invokes a provider operation that requires authentication
- **THEN** Cagnard SHALL supply the plugin with a scoped credential handle or scoped token rather than exposing unrelated account secrets

#### Scenario: Block UI secret access
- **WHEN** the browser UI renders account or operation state
- **THEN** Cagnard SHALL provide redacted credential metadata instead of raw credential values

### Requirement: Account permissions and operation policy
Cagnard SHALL enforce scoped role permissions, account enabled/read-only state, provider capabilities, and operation confirmation policies before invoking storage operations. Account restrictions SHALL remain an upper bound that role grants cannot override.

#### Scenario: Read-only account blocks mutation
- **WHEN** an operation would write, create a folder, rename, delete, copy into, or move into/from a read-only account in a way that mutates it
- **THEN** Cagnard SHALL block the mutating phase while permitting separately authorized reads and copy-out operations

#### Scenario: Read-only account blocks provider write
- **WHEN** a role grants write but the account is read-only
- **THEN** Cagnard SHALL reject the write before invoking the provider

#### Scenario: Writable account allows authorized mutation
- **WHEN** the account is writable, the scoped action is granted, and the provider supports it
- **THEN** Cagnard SHALL allow the operation subject to its confirmation and overwrite requirements

#### Scenario: Claim mapping controls account-backed root access
- **WHEN** an external identity has no mapped group or direct binding granting access to an account-backed root
- **THEN** Cagnard SHALL deny that root without evaluating unvalidated claim expressions in the provider

#### Scenario: Policy blocks public sharing change
- **WHEN** an operation would create or modify public access without an explicitly supported and granted action
- **THEN** Cagnard SHALL reject it regardless of role names such as admin

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
Cagnard SHALL keep authentication credentials separate from storage credentials and expose only normalized principal and authorized resource data downstream. This browser OIDC implementation SHALL NOT delegate end-user provider tokens to storage accounts.

#### Scenario: Static auth provider returns principal
- **WHEN** static authentication succeeds
- **THEN** downstream services SHALL receive canonical identity and SHALL NOT receive password or verifier material

#### Scenario: OIDC provider returns principal
- **WHEN** OIDC authentication succeeds
- **THEN** downstream authorization SHALL receive the same principal contract and storage providers/UI SHALL NOT receive OIDC access, refresh, or ID tokens
