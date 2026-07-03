## Purpose

Defines the provider-neutral browser experience, navigation, metadata, preview, and storage actions.

## Requirements

### Requirement: Multi-provider browsing
Cagnard SHALL allow users to browse buckets, drives, folders, containers, directories, files, and objects across connected storage providers through one consistent browser experience.

#### Scenario: Browse across accounts and providers
- **WHEN** the user opens the storage browser with accounts connected for multiple providers
- **THEN** Cagnard SHALL show the available accounts and storage roots without requiring provider-specific navigation screens

#### Scenario: Open nested storage location
- **WHEN** the user opens a bucket, drive, container, folder, or directory
- **THEN** Cagnard SHALL list child entries using the provider plugin's listing capability

### Requirement: Multi-account support in navigation
Cagnard SHALL support multiple accounts per provider and make the active account context clear during browsing and operations.

#### Scenario: Display accounts from same provider
- **WHEN** the user connects two S3-compatible accounts
- **THEN** Cagnard SHALL display both accounts as separate selectable account contexts under the provider family

#### Scenario: Prevent ambiguous operation target
- **WHEN** the user starts an upload, rename, move, delete, or transfer operation
- **THEN** Cagnard SHALL include the source or destination account context in the operation target

### Requirement: Personal and global navigation areas
Cagnard SHALL display personal storage and global storage as separate navigation areas when both access tunnels are enabled for the user.

#### Scenario: Show personal storage area
- **WHEN** the user has one or more personal home storage roots
- **THEN** Cagnard SHALL show a personal navigation area such as "Home" or "My documents"

#### Scenario: Show global storage area
- **WHEN** the user has access to one or more global storage points
- **THEN** Cagnard SHALL show a global navigation area containing the accessible global storage points

#### Scenario: Hide disabled tunnel
- **WHEN** the user has no access through a personal or global storage tunnel
- **THEN** Cagnard SHALL not show the disabled tunnel as an empty primary navigation area

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

### Requirement: Capability-driven browser actions
Cagnard SHALL enable search, preview, download, upload, create folder, rename, copy, move, and delete actions only when the selected provider, account, and storage entry expose the required capabilities.

#### Scenario: Enable available action
- **WHEN** a selected storage entry supports download and preview
- **THEN** Cagnard SHALL offer download and preview actions for that entry

#### Scenario: Disable unavailable action
- **WHEN** a selected storage entry does not support delete
- **THEN** Cagnard SHALL show delete as unavailable or omit it according to the UI policy

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

### Requirement: Same-root copy and move
Cagnard SHALL support copy and move within the active storage root using explicit target paths.

#### Scenario: Copy file within root
- **WHEN** the user copies a selected file to a target path in the same storage root
- **THEN** Cagnard SHALL create the target file without removing the source

#### Scenario: Move entry within root
- **WHEN** the user moves a selected file or directory to a target path in the same storage root
- **THEN** Cagnard SHALL create the target entry and remove the source entry

### Requirement: Search across storage providers
Cagnard SHALL support search through provider-native search when available and through clearly scoped fallback behavior when native search is unavailable.

#### Scenario: Use provider-native search
- **WHEN** the active provider exposes a native search capability
- **THEN** Cagnard SHALL execute search through that provider capability and show the provider and account scope of the results

#### Scenario: Explain limited search scope
- **WHEN** the active provider does not expose native search
- **THEN** Cagnard SHALL restrict search to an available fallback scope and identify that limitation to the user

### Requirement: Current-directory filtering and sorting
Cagnard SHALL allow the user to filter and sort the entries currently loaded for the active directory without changing the active storage root or path.

#### Scenario: Filter current directory
- **WHEN** the user enters a current-directory search term
- **THEN** Cagnard SHALL restrict the displayed entries to matching loaded entries and show the filtered count

#### Scenario: Sort by metadata column
- **WHEN** the user sorts by name, type, size, modified time, or MIME type
- **THEN** Cagnard SHALL reorder the current listing by that column while preserving selection semantics

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

#### Scenario: Compare normalized metadata
- **WHEN** the user selects entries from different providers
- **THEN** Cagnard SHALL show comparable normalized metadata fields for each entry

#### Scenario: Show unavailable metadata explicitly
- **WHEN** a provider cannot supply a normalized metadata field
- **THEN** Cagnard SHALL display that field as unavailable rather than blank or false

#### Scenario: Compare modified time
- **WHEN** the provider supplies a modified timestamp for an entry
- **THEN** Cagnard SHALL display the timestamp as normalized metadata and allow sorting by it in the browser listing

### Requirement: Provider-neutral primary UI
Cagnard SHALL keep the primary browser workflow provider-neutral while allowing contextual access to provider-specific features.

#### Scenario: Avoid provider-specific primary controls
- **WHEN** the user browses mixed storage providers
- **THEN** Cagnard SHALL present common browser actions consistently and keep provider-specific actions in contextual extension surfaces

#### Scenario: Expose provider feature without clutter
- **WHEN** a selected provider exposes a feature that only applies to that provider
- **THEN** Cagnard SHALL expose the feature near the selected entry or account without changing unrelated provider views

### Requirement: Operation result feedback
Cagnard SHALL report the result of browser operations with enough detail to understand success, partial success, provider rejection, and capability limitation.

#### Scenario: Provider rejects operation
- **WHEN** a provider rejects an upload, rename, move, delete, or download operation
- **THEN** Cagnard SHALL show the canonical failure category and provider-specific diagnostic details when safe to display

#### Scenario: Operation succeeds
- **WHEN** a browser operation completes successfully
- **THEN** Cagnard SHALL refresh or update the affected storage location so the browser reflects the new state

#### Scenario: Target conflict
- **WHEN** an upload, copy, or move target already exists without overwrite approval
- **THEN** Cagnard SHALL reject the operation and show a conflict message

#### Scenario: Mutation fails
- **WHEN** a mutation operation fails
- **THEN** Cagnard SHALL show a safe diagnostic message and preserve the current listing state
