# s3-storage-provider Specification

## Purpose
TBD - created by archiving change add-s3-support. Update Purpose after archive.
## Requirements
### Requirement: S3-compatible provider registration
Cagnard SHALL support an S3-compatible storage provider that can be registered from stateless HOCON configuration without requiring backend-local persistent state.

#### Scenario: Register S3 provider
- **WHEN** configuration declares a provider with S3-compatible type and required provider settings
- **THEN** Cagnard SHALL register that provider under the common storage provider abstraction

#### Scenario: Reject invalid S3 provider configuration
- **WHEN** an S3-compatible provider declaration is missing required endpoint, region, or compatibility settings needed to construct the client
- **THEN** Cagnard SHALL fail startup or disable that provider with an explicit configuration diagnostic

#### Scenario: Preserve provider-neutral browser routes
- **WHEN** an S3-compatible provider is registered
- **THEN** Cagnard SHALL expose its roots, entries, metadata, and operations through the existing provider-neutral storage APIs

### Requirement: S3 connection compatibility settings
Cagnard SHALL expose S3-compatible connection settings required by AWS S3 and common non-AWS providers.

#### Scenario: Configure custom endpoint
- **WHEN** an administrator configures an S3-compatible endpoint URL
- **THEN** Cagnard SHALL use that endpoint for the provider client instead of assuming the default AWS endpoint

#### Scenario: Configure path-style addressing
- **WHEN** an administrator enables path-style addressing for an S3-compatible provider
- **THEN** Cagnard SHALL use path-style bucket addressing for that provider

#### Scenario: Configure SSL behavior
- **WHEN** an administrator configures SSL/TLS enablement or local-development SSL verification behavior
- **THEN** Cagnard SHALL apply those settings to the S3-compatible provider client and document unsafe verification overrides as insecure

#### Scenario: Configure request checksum behavior
- **WHEN** an administrator uses a non-AWS or non-TLS S3-compatible endpoint with streamed uploads
- **THEN** Cagnard SHALL allow request checksum calculation to be configured and SHALL default to a mode compatible with unseekable streamed request bodies

#### Scenario: Stream unseekable request bodies
- **WHEN** Cagnard streams an S3 upload from a provider-neutral reader
- **THEN** Cagnard SHALL use request signing behavior that does not require pre-reading or seeking the full object body

### Requirement: S3 credential modes
Cagnard SHALL support common S3 credential modes while keeping credential material out of browser-visible metadata and backend-local persistent state.

#### Scenario: Use static key credentials
- **WHEN** an S3 account is configured with static access key id, secret access key, and optional session token
- **THEN** Cagnard SHALL authenticate S3 requests with those configured credentials

#### Scenario: Use default provider chain
- **WHEN** an S3 account is configured to use the default credential provider chain
- **THEN** Cagnard SHALL resolve credentials from the runtime environment without writing them to application storage

#### Scenario: Use named profile
- **WHEN** an S3 account is configured with a named profile and the runtime environment provides compatible profile files
- **THEN** Cagnard SHALL resolve S3 credentials from that profile

#### Scenario: Avoid credential disclosure
- **WHEN** provider registration, authentication, or S3 operations fail
- **THEN** Cagnard SHALL omit access keys, secret keys, session tokens, and full credential settings from user-visible diagnostics

### Requirement: S3 bucket and prefix roots
Cagnard SHALL model S3 storage roots as explicit bucket and optional prefix targets while presenting clean display names in navigation.

#### Scenario: Configure bucket root
- **WHEN** an S3 storage root declares a bucket and no prefix
- **THEN** Cagnard SHALL expose the bucket as the root target and use the bucket name as the default display label when no custom label is configured

#### Scenario: Configure prefix root
- **WHEN** an S3 storage root declares a bucket and prefix
- **THEN** Cagnard SHALL scope all browser operations to that prefix and expose paths relative to the configured prefix

#### Scenario: Use custom display label
- **WHEN** an administrator configures a custom display label for an S3 root
- **THEN** Cagnard SHALL show that label in navigation instead of exposing long or unsuitable bucket and prefix names as the primary user-facing label

#### Scenario: Preserve concrete S3 target metadata
- **WHEN** Cagnard displays or returns an S3 root or entry with a custom display label
- **THEN** Cagnard SHALL preserve the concrete bucket, prefix, and object key in namespaced provider-specific metadata

### Requirement: S3 directory-like listing
Cagnard SHALL present S3 objects and common prefixes as provider-neutral storage entries using directory-like navigation semantics.

#### Scenario: List common prefixes
- **WHEN** the S3 provider lists a location containing common prefixes
- **THEN** Cagnard SHALL return those prefixes as directory entries with paths relative to the configured root

#### Scenario: List objects
- **WHEN** the S3 provider lists a location containing objects
- **THEN** Cagnard SHALL return those objects as file entries with paths relative to the configured root

#### Scenario: Deduplicate folder markers
- **WHEN** a zero-byte folder marker and a common prefix describe the same directory-like path
- **THEN** Cagnard SHALL return a single directory entry for that path

#### Scenario: Keep listing inside root prefix
- **WHEN** a user browses an S3 root configured with a prefix
- **THEN** Cagnard SHALL NOT expose entries outside that configured prefix

### Requirement: S3 normalized metadata
Cagnard SHALL map S3 object metadata into normalized storage metadata where values are available and SHALL report unavailable fields explicitly.

#### Scenario: Map common object metadata
- **WHEN** an S3 object exposes content length, content type, or last modified timestamp
- **THEN** Cagnard SHALL map those values to normalized size, MIME type, and modified time metadata

#### Scenario: Map optional object metadata
- **WHEN** an S3 object exposes version id, server-side encryption, or object lock retention metadata
- **THEN** Cagnard SHALL map those values to normalized version, encryption, and retention metadata

#### Scenario: Mark unavailable permission metadata
- **WHEN** the S3 provider cannot return owner or permission metadata safely and consistently
- **THEN** Cagnard SHALL mark those normalized metadata fields as unavailable rather than returning misleading empty values

#### Scenario: Preserve S3-specific metadata
- **WHEN** an S3 object exposes provider-specific fields such as ETag, storage class, bucket, key, checksum, or object lock mode
- **THEN** Cagnard SHALL expose those fields through namespaced provider-specific metadata

### Requirement: S3 content operations
Cagnard SHALL support S3-compatible object download, upload, and bounded text preview through the common content operation model.

#### Scenario: Download S3 object
- **WHEN** a user downloads an S3 file entry within the configured buffered object limit
- **THEN** Cagnard SHALL return the raw object bytes and safe response metadata through the existing download API

#### Scenario: Upload S3 object
- **WHEN** a user uploads bytes to a valid S3 target path within the configured buffered object limit
- **THEN** Cagnard SHALL write those bytes as an S3 object under the configured bucket and root prefix

#### Scenario: Enforce buffered object limit
- **WHEN** an S3 upload or download would exceed the configured buffered object limit
- **THEN** Cagnard SHALL reject the operation with a safe diagnostic before materializing excessive object bytes in memory

#### Scenario: Use default buffered object limit
- **WHEN** no S3 buffered object limit is configured
- **THEN** Cagnard SHALL apply a default limit of 64 MiB per object for buffered upload and download operations

#### Scenario: Preview supported text object
- **WHEN** a user previews an S3 object with supported text metadata and content within the preview limit
- **THEN** Cagnard SHALL return bounded text preview content through the existing preview API

### Requirement: S3 lifecycle operations
Cagnard SHALL implement practical S3 object lifecycle operations and SHALL report non-atomic or unsupported filesystem-like semantics through capabilities.

#### Scenario: Create folder marker
- **WHEN** a user creates a folder in an S3 root
- **THEN** Cagnard SHALL create an S3 zero-byte folder marker or equivalent prefix representation compatible with later listing

#### Scenario: Copy object
- **WHEN** a user copies an S3 file entry to a valid target path in the same S3 root
- **THEN** Cagnard SHALL create the target object without deleting the source object

#### Scenario: Move object as degraded operation
- **WHEN** a user moves an S3 file entry to a valid target path in the same S3 root
- **THEN** Cagnard SHALL implement the move as copy-then-delete and report the move capability as degraded for object-store semantics

#### Scenario: Rename object as degraded operation
- **WHEN** a user renames an S3 file entry within the same parent path
- **THEN** Cagnard SHALL implement the rename as copy-then-delete and report the rename capability as degraded for object-store semantics

#### Scenario: Delete object
- **WHEN** a user deletes an S3 file entry
- **THEN** Cagnard SHALL delete the corresponding S3 object subject to account mutability and provider policy checks

#### Scenario: Reject recursive prefix mutation
- **WHEN** a user requests recursive copy, move, rename, or delete of an S3 directory-like prefix before recursive support is implemented
- **THEN** Cagnard SHALL reject the operation as unsupported rather than partially mutating the prefix

### Requirement: S3 capability and limitation reporting
Cagnard SHALL report S3-compatible provider capabilities, degraded semantics, and operational limits before enabling browser actions.

#### Scenario: Report read-only root limitations
- **WHEN** an S3 account or root is configured read-only
- **THEN** Cagnard SHALL report upload, create folder, rename, copy, move, and delete capabilities as unsupported for that root

#### Scenario: Report degraded object-store operations
- **WHEN** an S3 provider supports rename or move only through copy-then-delete
- **THEN** Cagnard SHALL report those capabilities as degraded with a description of the semantic limitation

#### Scenario: Report optional feature availability
- **WHEN** S3 versioning, object lock, retention, encryption metadata, or provider-specific extensions are unavailable for a root or object
- **THEN** Cagnard SHALL report those fields or actions as unavailable rather than assuming AWS-only behavior

#### Scenario: Report pagination constraints
- **WHEN** S3 listing requires paginated object retrieval
- **THEN** Cagnard SHALL keep listing results correct across pages or report an explicit paging limitation if a configured limit is reached
