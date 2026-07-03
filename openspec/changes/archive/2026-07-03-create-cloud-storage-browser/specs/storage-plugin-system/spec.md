## ADDED Requirements

### Requirement: Provider-neutral storage abstraction
Cagnard SHALL represent every storage implementation as a provider plugin exposing accounts, storage roots, and storage entries through a common storage model.

#### Scenario: Browse heterogeneous storage roots
- **WHEN** the user connects an S3 account, an Azure Blob account, and a Unix filesystem account
- **THEN** Cagnard SHALL expose their buckets, containers, directories, and files through the same storage root and entry model

#### Scenario: Treat provider terminology as display metadata
- **WHEN** a provider calls top-level storage "buckets", "drives", "containers", "folders", or "directories"
- **THEN** Cagnard SHALL preserve the provider terminology as display metadata while keeping core operations provider-neutral

### Requirement: Capability discovery
Each storage plugin SHALL declare its supported capabilities, unsupported capabilities, degraded capabilities, and provider constraints before Cagnard enables operations for that plugin.

#### Scenario: Disable unsupported operation
- **WHEN** a plugin reports that rename is unsupported for a selected storage entry
- **THEN** Cagnard SHALL not offer rename as an enabled primary action for that entry

#### Scenario: Explain degraded operation
- **WHEN** a plugin reports that move is implemented as copy then delete
- **THEN** Cagnard SHALL expose the operation as degraded and make the semantic limitation available to the UI and transfer engine

### Requirement: Canonical storage operations
The plugin API SHALL define canonical operations for listing, stat, search, preview, download, upload, rename, move, delete, permission lookup, version lookup, retention lookup, encryption lookup, and transfer stream access.

#### Scenario: Register plugin with partial operation support
- **WHEN** a plugin supports list, stat, download, and upload but does not support search or permission lookup
- **THEN** Cagnard SHALL register the plugin and mark only the unavailable operations as unsupported

### Requirement: Provider-specific extensions
Cagnard SHALL allow plugins to expose provider-specific actions and metadata through namespaced extensions without requiring the primary browser UI to become provider-specific.

#### Scenario: Show provider-specific action contextually
- **WHEN** an S3-compatible plugin exposes a provider-specific action for object lock retention
- **THEN** Cagnard SHALL surface that action as an extension for compatible entries without adding S3-specific controls to unrelated providers

#### Scenario: Preserve normalized metadata first
- **WHEN** a provider exposes both normalized metadata and provider-specific metadata
- **THEN** Cagnard SHALL present normalized metadata as the common comparison surface and keep provider-specific metadata namespaced

### Requirement: Initial provider targets
Cagnard SHALL define initial provider plugin targets for S3-compatible object storage, at least one Google storage integration, Azure Blob Storage, WebDAV or SFTP, and Unix filesystem storage.

#### Scenario: Include Unix filesystem storage
- **WHEN** the initial provider set is planned
- **THEN** Cagnard SHALL include Unix filesystem storage as a first-class plugin target rather than a special internal exception

#### Scenario: Support S3-compatible providers
- **WHEN** the S3-compatible plugin is configured against AWS S3, MinIO, Cloudflare R2, Wasabi, or another compatible endpoint
- **THEN** Cagnard SHALL treat the endpoint as the same provider family with endpoint-specific configuration

### Requirement: Provider limitation reporting
Storage plugins SHALL report operational limits that can affect correctness, performance, or user expectations.

#### Scenario: Report pagination and rate limits
- **WHEN** a provider requires paginated listing or applies rate limits
- **THEN** the plugin SHALL report those constraints so Cagnard can plan browsing, search, and transfer behavior

#### Scenario: Report unavailable metadata
- **WHEN** a provider cannot return owner, permissions, version, retention, or encryption metadata
- **THEN** the plugin SHALL report the metadata field as unavailable instead of returning misleading empty values

### Requirement: Core-mediated plugin operations
Cagnard SHALL route plugin operations through the core authorization, credential, capability, and audit layers before invoking provider behavior.

#### Scenario: Block direct destructive operation
- **WHEN** a plugin requests to delete a storage entry
- **THEN** Cagnard SHALL evaluate the account permissions, operation capability, and audit policy before the provider delete call is executed
