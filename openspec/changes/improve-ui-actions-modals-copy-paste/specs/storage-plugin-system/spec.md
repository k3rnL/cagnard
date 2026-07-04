## MODIFIED Requirements

### Requirement: Canonical storage operations
The plugin API SHALL define canonical operations for listing, stat, search, preview or bounded read, download, upload, create folder, rename, move, copy, delete, permission lookup, version lookup, retention lookup, encryption lookup, and transfer or file-opening content access.

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

### Requirement: Provider limitation reporting
Storage plugins SHALL report operational limits that can affect correctness, performance, file opening, editing, transfer, pasteboard copy/move, or user expectations.

#### Scenario: Report pagination and rate limits
- **WHEN** a provider requires paginated listing or applies rate limits
- **THEN** the plugin SHALL report those constraints so Cagnard can plan browsing, search, opening, and transfer behavior

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
