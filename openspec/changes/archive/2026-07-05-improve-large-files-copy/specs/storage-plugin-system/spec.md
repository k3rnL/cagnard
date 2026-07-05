## MODIFIED Requirements

### Requirement: Canonical storage operations
The plugin API SHALL define canonical operations for listing, stat, search, preview or bounded read, download, upload, create folder, rename, move, copy, delete, permission lookup, version lookup, retention lookup, encryption lookup, and transfer or file-opening content access.

#### Scenario: Register plugin with streaming transfer support
- **WHEN** a plugin supports stream read, stream write, multipart upload, provider-native copy, verification, cleanup, or retry hints
- **THEN** Cagnard SHALL register those transfer capabilities separately from basic download and upload support

#### Scenario: Register plugin with partial transfer support
- **WHEN** a plugin supports basic download and upload but not streaming or multipart transfer
- **THEN** Cagnard SHALL register it for bounded fallback transfer only and expose the configured fallback limits

### Requirement: Provider limitation reporting
Storage plugins SHALL report operational limits that can affect correctness, performance, file opening, editing, transfer, pasteboard copy/move, or user expectations.

#### Scenario: Report streaming limits
- **WHEN** a provider limits stream size, chunk size, concurrency, rate, or retry behavior
- **THEN** the plugin SHALL report those constraints so Cagnard can plan transfer jobs safely

#### Scenario: Report multipart limits
- **WHEN** a provider supports multipart transfer with minimum part size, maximum part count, or abort requirements
- **THEN** the plugin SHALL expose those limits to the transfer engine

#### Scenario: Report verification support
- **WHEN** a provider can verify destination writes with size, checksum, etag, version, stat, or provider-specific metadata
- **THEN** the plugin SHALL expose the available verification method and its reliability level

### Requirement: Large-file content access capabilities
Storage plugins SHALL expose content access capabilities that let Cagnard distinguish full buffered reads, bounded text reads, range reads, stream reads, stream writes, multipart writes, and provider-native transfer behavior.

#### Scenario: Stream read and write supported
- **WHEN** a storage plugin supports streaming content delivery or streaming destination writes
- **THEN** Cagnard SHALL expose that capability to opener plugins and transfer jobs that can avoid full in-memory buffering

#### Scenario: Provider-native copy supported
- **WHEN** a storage plugin supports server-side copy within a provider account, root, bucket, or compatible endpoint
- **THEN** Cagnard SHALL expose the scope and semantic guarantees of that copy capability

#### Scenario: Bounded buffered read only
- **WHEN** a storage plugin supports only full buffered download for content access
- **THEN** Cagnard SHALL enforce configured object size limits before routing files to openers or transfer fallback paths that require complete content

### Requirement: Core-mediated plugin operations
Cagnard SHALL route plugin operations through the core authorization, credential, capability, and audit layers before invoking provider behavior.

#### Scenario: Mediate transfer job task
- **WHEN** a transfer job task reads, writes, verifies, cleans up, or deletes provider content
- **THEN** Cagnard SHALL evaluate provider capability, account permission, user authorization, and audit policy for that phase

#### Scenario: Mediate pasteboard move deletion
- **WHEN** pasteboard move execution reaches source deletion
- **THEN** Cagnard SHALL evaluate source delete permission and capability after destination verification and before deleting the source
