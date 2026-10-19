## MODIFIED Requirements

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

### Requirement: Auth provider credential boundary
Cagnard SHALL keep authentication credentials separate from storage credentials and expose only normalized principal and authorized resource data downstream. This browser OIDC implementation SHALL NOT delegate end-user provider tokens to storage accounts.

#### Scenario: Static auth provider returns principal
- **WHEN** static authentication succeeds
- **THEN** downstream services SHALL receive canonical identity and SHALL NOT receive password or verifier material

#### Scenario: OIDC provider returns principal
- **WHEN** OIDC authentication succeeds
- **THEN** downstream authorization SHALL receive the same principal contract and storage providers/UI SHALL NOT receive OIDC access, refresh, or ID tokens

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
