## MODIFIED Requirements

### Requirement: Canonical storage operations
The plugin API SHALL define canonical operations for listing, stat, search, preview or bounded read, download, upload, create folder, rename, move, copy, delete, permission lookup, version lookup, retention lookup, encryption lookup, and transfer or file-opening content access.

#### Scenario: Register plugin with partial operation support
- **WHEN** a plugin supports list, stat, download, and upload but does not support search, permission lookup, range read, or stream read
- **THEN** Cagnard SHALL register the plugin and mark only the unavailable operations as unsupported

#### Scenario: Register plugin with lifecycle operations
- **WHEN** a plugin supports create folder, rename, copy, move, and delete
- **THEN** Cagnard SHALL expose those operations through capability discovery for compatible entries

### Requirement: Provider limitation reporting
Storage plugins SHALL report operational limits that can affect correctness, performance, file opening, editing, transfer, or user expectations.

#### Scenario: Report pagination and rate limits
- **WHEN** a provider requires paginated listing or applies rate limits
- **THEN** the plugin SHALL report those constraints so Cagnard can plan browsing, search, opening, and transfer behavior

#### Scenario: Report unavailable metadata
- **WHEN** a provider cannot return owner, permissions, version, retention, or encryption metadata
- **THEN** the plugin SHALL report the metadata field as unavailable instead of returning misleading empty values

#### Scenario: Report content access limits
- **WHEN** a provider cannot support full reads, range reads, stream reads, or writes above configured limits
- **THEN** the plugin SHALL report those limits so Cagnard can disable incompatible openers and mutations

## ADDED Requirements

### Requirement: Large-file content access capabilities
Storage plugins SHALL expose content access capabilities that let Cagnard distinguish full buffered reads, bounded text reads, range reads, stream reads, and provider-native preview or open behavior.

#### Scenario: Full buffered read only
- **WHEN** a storage plugin supports only full buffered download for content access
- **THEN** Cagnard SHALL enforce configured object size limits before routing files to openers that require complete content

#### Scenario: Range read supported
- **WHEN** a storage plugin supports byte-range reads for an entry
- **THEN** Cagnard SHALL expose that capability to opener plugins that can operate through partial content access

#### Scenario: Stream read supported
- **WHEN** a storage plugin supports streaming content delivery
- **THEN** Cagnard SHALL expose that capability to opener plugins and transfer flows that can avoid full in-memory buffering

### Requirement: Write-back capability semantics
Storage plugins SHALL report whether an entry supports overwrite, create-new-version, append, metadata update, or export-only save flows.

#### Scenario: Direct overwrite supported
- **WHEN** a provider can replace an existing file atomically or safely enough for direct editing
- **THEN** Cagnard MAY allow editor plugins to save changes through overwrite when user permissions allow it

#### Scenario: Versioned save supported
- **WHEN** a provider supports versioned writes or new-version creation
- **THEN** Cagnard MAY allow editor plugins to save changes as a new version when the opener declares that strategy

#### Scenario: Write-back unsupported
- **WHEN** a provider or selected entry does not support safe write-back
- **THEN** Cagnard SHALL restrict editor-capable openers to read-only or export-only behavior
