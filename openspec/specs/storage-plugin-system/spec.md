## Purpose

Defines the storage plugin abstraction, capability discovery, provider limitations, and initial provider targets.

## Requirements

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
The plugin API SHALL define canonical operations for paginated listing, full recursive listing, stat, search, preview or bounded read, download, upload, create folder, rename, move, copy, delete, permission lookup, version lookup, retention lookup, encryption lookup, and transfer or file-opening content access.

#### Scenario: Register plugin with partial operation support
- **WHEN** a plugin supports list, stat, download, and upload but does not support search, permission lookup, range read, or stream read
- **THEN** Cagnard SHALL register the plugin and mark only the unavailable operations as unsupported

#### Scenario: Register plugin with lifecycle operations
- **WHEN** a plugin supports create folder, rename, copy, move, and delete
- **THEN** Cagnard SHALL expose those operations through capability discovery for compatible entries

#### Scenario: Register plugin for pasteboard transfer
- **WHEN** a plugin supports download/read and upload/write for files
- **THEN** Cagnard SHALL consider that plugin eligible for provider-neutral pasteboard copy subject to limits and authorization

#### Scenario: Register plugin for recursive pasteboard transfer
- **WHEN** a plugin supports recursive directory listing, create-folder, file read, and file write
- **THEN** Cagnard SHALL consider that plugin eligible for provider-neutral directory paste subject to limits and authorization

#### Scenario: Register plugin with paginated listing support
- **WHEN** a plugin supports browser-facing paginated listing with provider-neutral cursors
- **THEN** Cagnard SHALL use that listing capability for file browser pages

#### Scenario: Keep full listing for recursive operations
- **WHEN** transfer planning or another backend operation needs a complete directory listing
- **THEN** Cagnard MAY use a separate full listing operation subject to provider limits and authorization

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

### Requirement: Filesystem mutation safety
The Unix filesystem provider SHALL resolve every operation path within the configured storage root and SHALL reject paths that escape the root.

#### Scenario: Reject traversal path
- **WHEN** an operation path would resolve outside the configured storage root
- **THEN** the provider SHALL reject the operation before reading or writing filesystem content

#### Scenario: Allow nested root path
- **WHEN** an operation path resolves inside the configured storage root
- **THEN** the provider SHALL allow the operation to proceed subject to capability and policy checks

### Requirement: Filesystem content operations
The Unix filesystem provider SHALL implement file content download, upload, and bounded text preview for regular files.

#### Scenario: Download regular file
- **WHEN** the user downloads a regular file
- **THEN** the provider SHALL return raw file bytes and safe response metadata without JSON encoding the content

#### Scenario: Upload new file
- **WHEN** the user uploads bytes to a non-existing target path
- **THEN** the provider SHALL create parent directories as needed within the root and write the file

#### Scenario: Preview text file
- **WHEN** the user previews a regular text file within the size limit
- **THEN** the provider SHALL return text content for preview

### Requirement: Filesystem lifecycle operations
The Unix filesystem provider SHALL implement create folder, rename, delete, copy, and move operations within the configured root.

#### Scenario: Create directory
- **WHEN** the provider receives a create-folder request for a valid path
- **THEN** it SHALL create the directory within the configured root

#### Scenario: Rename entry
- **WHEN** the provider receives a rename request for an existing entry and valid new name
- **THEN** it SHALL rename the entry within the same parent directory

#### Scenario: Delete file or empty directory
- **WHEN** the provider receives a delete request for an existing file or empty directory
- **THEN** it SHALL delete that entry

#### Scenario: Copy file
- **WHEN** the provider receives a copy request for a regular file and valid target path
- **THEN** it SHALL copy the file content to the target path

#### Scenario: Move entry
- **WHEN** the provider receives a move request for an existing entry and valid target path
- **THEN** it SHALL move the entry to the target path

### Requirement: Provider limitation reporting
Storage plugins SHALL report operational limits that can affect correctness, performance, file opening, editing, browsing pagination, transfer, pasteboard copy/move, or user expectations.

#### Scenario: Report pagination and rate limits
- **WHEN** a provider requires paginated listing, limits page size, limits scanned pages, or applies rate limits
- **THEN** the plugin SHALL report those constraints so Cagnard can plan browsing, search, sorting, opening, and transfer behavior

#### Scenario: Report unavailable metadata
- **WHEN** a provider cannot return owner, permissions, version, retention, or encryption metadata
- **THEN** the plugin SHALL report the metadata field as unavailable instead of returning misleading empty values

#### Scenario: Report content access limits
- **WHEN** a provider cannot support full reads, range reads, stream reads, or writes above configured limits
- **THEN** the plugin SHALL report those limits so Cagnard can disable incompatible openers and mutations

#### Scenario: Report transfer limit
- **WHEN** a provider can only participate in buffered transfer up to a configured object size
- **THEN** the plugin SHALL expose that limit so pasteboard transfer can fail before reading oversized source content

#### Scenario: Report recursive transfer limitation
- **WHEN** a provider cannot recursively list directories, represent empty directories, or create destination directories
- **THEN** the plugin SHALL expose that limitation so directory paste can be blocked or degraded before mutation

### Requirement: Provider-neutral paginated listing
Storage plugins SHALL expose a provider-neutral paginated listing operation for browser-facing directory listings.

#### Scenario: Return listing page
- **WHEN** Cagnard asks a storage plugin for a paginated listing
- **THEN** the plugin SHALL return entries for the requested page, normalized accuracy metadata, and a provider cursor when another page can be loaded

#### Scenario: Apply listing criteria before slicing
- **WHEN** listing options include search, sort key, or sort direction
- **THEN** the plugin or backend adapter SHALL apply those criteria to the current directory scope before page slicing

#### Scenario: Use provider-native cursor
- **WHEN** the provider exposes a native continuation token, offset, keyset cursor, or equivalent page reference
- **THEN** the plugin MAY use that native cursor internally while exposing only provider-neutral cursor data to Cagnard core

#### Scenario: Preserve stateless page references
- **WHEN** the browser receives a page reference
- **THEN** that reference SHALL be opaque to the browser and SHALL be validated by the backend before any provider cursor is used

### Requirement: Listing accuracy reporting
Storage plugins SHALL report whether paginated listing search, sorting, and total counts are exact, unknown, unsupported, or degraded.

#### Scenario: Exact listing
- **WHEN** the provider applies the requested criteria to the complete current directory scope
- **THEN** Cagnard SHALL report search and sort accuracy as exact

#### Scenario: Unknown total
- **WHEN** the provider can return a page but cannot cheaply compute the total result count
- **THEN** Cagnard SHALL report the total as unknown rather than estimating it from the current page

#### Scenario: Unsupported listing criteria
- **WHEN** a provider cannot satisfy a requested search or sort mode within configured limits
- **THEN** Cagnard SHALL reject or mark the listing as unsupported or degraded without returning misleading page-only results

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

#### Scenario: Deliver declared range reads
- **WHEN** a storage plugin declares range read as supported for an entry
- **THEN** Cagnard SHALL be able to serve a byte-range request for that entry's content through the storage content access API, not merely report the capability as a flag

### Requirement: Change notification capability
Storage plugins SHALL declare whether they support change notification for a given entry, and MAY implement it through native provider push or backend-side polling.

#### Scenario: Native change notification supported
- **WHEN** a storage plugin can observe content changes to a file as they happen
- **THEN** Cagnard SHALL report change notification as supported for that plugin

#### Scenario: Change notification degraded
- **WHEN** a storage plugin has no native mechanism to observe content changes and instead polls for them
- **THEN** Cagnard SHALL report change notification as degraded for that plugin so the client-visible latency characteristics are understood as approximate

#### Scenario: Change notification unsupported
- **WHEN** a storage plugin cannot observe or approximate content changes at all
- **THEN** Cagnard SHALL report change notification as unsupported for that plugin

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

### Requirement: Core-mediated plugin operations
Cagnard SHALL route plugin operations through the core authorization, credential, capability, and audit layers before invoking provider behavior.

#### Scenario: Block direct destructive operation
- **WHEN** a plugin requests to delete a storage entry
- **THEN** Cagnard SHALL evaluate the account permissions, operation capability, and audit policy before the provider delete call is executed

#### Scenario: Mediate pasteboard transfer
- **WHEN** pasteboard execution requires reading from one provider and writing to another
- **THEN** Cagnard SHALL mediate both provider operations through the backend without exposing raw credentials to the frontend

#### Scenario: Mediate pasteboard move deletion
- **WHEN** pasteboard move execution reaches source deletion
- **THEN** Cagnard SHALL evaluate source delete permission and capability after destination success and before deleting the source
