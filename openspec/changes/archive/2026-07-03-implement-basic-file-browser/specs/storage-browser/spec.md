## ADDED Requirements

### Requirement: Entry selection
Cagnard SHALL allow the user to select one or more file or directory entries and SHALL bind available actions to the selected entries and active storage root.

#### Scenario: Select file entry
- **WHEN** the user selects a file in the browser listing
- **THEN** Cagnard SHALL show the file as selected and update the metadata and action surfaces for that entry

#### Scenario: Select directory entry
- **WHEN** the user selects a directory in the browser listing
- **THEN** Cagnard SHALL show the directory as selected without navigating until the user opens it

#### Scenario: Select multiple entries
- **WHEN** the user selects multiple entries in the browser listing
- **THEN** Cagnard SHALL show a multi-selection summary and enable only actions valid for that selection

### Requirement: Breadcrumb navigation
Cagnard SHALL show breadcrumb navigation for the current path and allow returning to any ancestor path in the active storage root.

#### Scenario: Navigate to ancestor
- **WHEN** the user activates a breadcrumb ancestor
- **THEN** Cagnard SHALL list entries for that ancestor path in the same storage root

#### Scenario: Navigate to root
- **WHEN** the user activates the root breadcrumb
- **THEN** Cagnard SHALL list the storage root path

### Requirement: Basic file actions
Cagnard SHALL support download, upload, create folder, rename, delete, copy, and move actions for the active storage root when the root and selected entries expose the required capabilities.

#### Scenario: Create folder
- **WHEN** the user creates a folder in the current directory
- **THEN** Cagnard SHALL create the directory and refresh the listing

#### Scenario: Rename selected entry
- **WHEN** the user renames a selected file or directory
- **THEN** Cagnard SHALL update the entry name and refresh the listing

#### Scenario: Delete selected entry
- **WHEN** the user confirms deletion of a selected file or empty directory
- **THEN** Cagnard SHALL delete the entry and refresh the listing

#### Scenario: Upload file
- **WHEN** the user uploads a file to the current directory
- **THEN** Cagnard SHALL write the file and refresh the listing

#### Scenario: Download file
- **WHEN** the user downloads a selected file
- **THEN** Cagnard SHALL return the file content as raw bytes in a downloadable response

### Requirement: Current-directory filtering and sorting
Cagnard SHALL allow the user to filter and sort the entries currently loaded for the active directory without changing the active storage root or path.

#### Scenario: Filter current directory
- **WHEN** the user enters a current-directory search term
- **THEN** Cagnard SHALL restrict the displayed entries to matching loaded entries and show the filtered count

#### Scenario: Sort by metadata column
- **WHEN** the user sorts by name, type, size, modified time, or MIME type
- **THEN** Cagnard SHALL reorder the current listing by that column while preserving selection semantics

### Requirement: Same-root copy and move
Cagnard SHALL support copy and move within the active storage root using explicit target paths.

#### Scenario: Copy file within root
- **WHEN** the user copies a selected file to a target path in the same storage root
- **THEN** Cagnard SHALL create the target file without removing the source

#### Scenario: Move entry within root
- **WHEN** the user moves a selected file or directory to a target path in the same storage root
- **THEN** Cagnard SHALL create the target entry and remove the source entry

### Requirement: Conflict and operation feedback
Cagnard SHALL report operation results for success, conflict, denied capability, invalid path, provider failure, and read-only blocking.

#### Scenario: Target conflict
- **WHEN** an upload, copy, or move target already exists without overwrite approval
- **THEN** Cagnard SHALL reject the operation and show a conflict message

#### Scenario: Mutation succeeds
- **WHEN** a mutation operation succeeds
- **THEN** Cagnard SHALL show success feedback and refresh the affected listing

#### Scenario: Mutation fails
- **WHEN** a mutation operation fails
- **THEN** Cagnard SHALL show a safe diagnostic message and preserve the current listing state

## MODIFIED Requirements

### Requirement: File preview
Cagnard SHALL preview supported files and objects based on normalized metadata, content type, size limits, provider download or preview capabilities, and registered UI preview plugins.

#### Scenario: Preview supported MIME type
- **WHEN** the user previews an entry with a supported MIME type and accessible content
- **THEN** Cagnard SHALL render an appropriate preview without requiring the user to download the file manually

#### Scenario: Refuse unsafe or unsupported preview
- **WHEN** the entry is too large, has an unsupported MIME type, or lacks a safe preview capability
- **THEN** Cagnard SHALL decline inline preview and offer available alternative actions

#### Scenario: Preview supported text file
- **WHEN** the selected file is a supported text file within the preview size limit
- **THEN** Cagnard SHALL display the text content in the preview panel

### Requirement: Metadata comparison
Cagnard SHALL provide a normalized metadata view for size, MIME type, owner, permissions, modified time, version, retention, and encryption state across providers.

#### Scenario: Compare modified time
- **WHEN** the provider supplies a modified timestamp for an entry
- **THEN** Cagnard SHALL display the timestamp as normalized metadata and allow sorting by it in the browser listing
