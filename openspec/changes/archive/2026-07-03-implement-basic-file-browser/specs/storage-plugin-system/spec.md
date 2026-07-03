## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Canonical storage operations
The plugin API SHALL define canonical operations for listing, stat, search, preview, download, upload, create folder, rename, move, copy, delete, permission lookup, version lookup, retention lookup, encryption lookup, and transfer stream access.

#### Scenario: Register plugin with partial operation support
- **WHEN** a plugin supports list, stat, download, and upload but does not support search or permission lookup
- **THEN** Cagnard SHALL register the plugin and mark only the unavailable operations as unsupported

#### Scenario: Register plugin with lifecycle operations
- **WHEN** a plugin supports create folder, rename, copy, move, and delete
- **THEN** Cagnard SHALL expose those operations through capability discovery for compatible entries
