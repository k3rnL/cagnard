## MODIFIED Requirements

### Requirement: S3-compatible provider registration
Cagnard SHALL preserve S3-compatible provider behavior in the Go backend.

#### Scenario: Register S3 provider from existing config
- **WHEN** a current Cagnard HOCON file declares an S3-compatible provider, account, and root
- **THEN** the Go backend SHALL construct an S3-compatible client and expose the root through provider-neutral storage APIs

#### Scenario: Preserve non-AWS compatibility settings
- **WHEN** configuration sets custom endpoint, path-style addressing, SSL enablement, or unsafe local certificate options
- **THEN** the Go S3 provider SHALL apply those settings for AWS S3 and common S3-compatible providers such as MinIO, R2, and Wasabi

### Requirement: S3 credential modes
Cagnard SHALL preserve current S3 credential modes in the Go backend.

#### Scenario: Use static credentials
- **WHEN** an account is configured with static access key id, secret access key, and optional session token
- **THEN** the Go S3 provider SHALL authenticate requests with those credentials without exposing them to browser-visible metadata

#### Scenario: Use default chain or profile
- **WHEN** an account is configured for default credential chain or named profile
- **THEN** the Go S3 provider SHALL resolve credentials from the runtime environment according to that mode

### Requirement: S3 prefix semantics
Cagnard SHALL preserve S3 directory-like prefix behavior in the Go backend.

#### Scenario: List common prefixes
- **WHEN** the S3 provider lists a location containing common prefixes
- **THEN** the Go backend SHALL return those prefixes as directory entries with paths relative to the configured root

#### Scenario: Stat implicit prefix
- **WHEN** a path has child objects under that prefix but no explicit folder marker object
- **THEN** the Go backend SHALL treat that path as a directory-like storage entry

#### Scenario: Delete prefix tree
- **WHEN** the user deletes an S3 directory-like prefix
- **THEN** the Go backend SHALL delete the prefix tree when it can enumerate the objects, subject to provider policy and account mutability

### Requirement: S3 content and lifecycle parity
Cagnard SHALL preserve S3 content and lifecycle behavior in the Go backend.

#### Scenario: Enforce buffered object limit
- **WHEN** an S3 upload, download, preview, or buffered transfer would exceed the configured object limit
- **THEN** the Go backend SHALL reject it before materializing excessive bytes in memory

#### Scenario: Preserve degraded move and rename
- **WHEN** moving or renaming an S3 object requires copy-then-delete semantics
- **THEN** the Go backend SHALL perform the degraded operation and expose the degraded capability status

#### Scenario: Preserve same-root object copy
- **WHEN** a same-root S3 file copy can use provider-native object copy safely
- **THEN** the Go backend SHALL use provider-native copy instead of downloading and re-uploading bytes through the backend
