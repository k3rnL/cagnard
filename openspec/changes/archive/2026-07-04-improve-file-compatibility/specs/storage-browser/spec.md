## MODIFIED Requirements

### Requirement: Capability-driven browser actions
Cagnard SHALL enable search, open, download, upload, create folder, rename, copy, move, and delete actions only when the selected provider, account, storage entry, and registered UI capabilities expose the required capabilities.

#### Scenario: Enable available action
- **WHEN** a selected storage entry supports download and a compatible opener is available
- **THEN** Cagnard SHALL offer download and open actions for that entry

#### Scenario: Disable unavailable action
- **WHEN** a selected storage entry does not support delete
- **THEN** Cagnard SHALL show delete as unavailable or omit it according to the UI policy

### Requirement: Current-directory filtering and sorting
Cagnard SHALL allow the user to filter and sort the entries currently loaded for the active directory without changing the active storage root or path.

#### Scenario: Filter current directory
- **WHEN** the user enters a current-directory search term
- **THEN** Cagnard SHALL restrict the displayed entries to matching loaded entries and show the filtered count

#### Scenario: Sort by metadata column
- **WHEN** the user sorts by name, type, size, modified time, MIME type, or file category
- **THEN** Cagnard SHALL reorder the current listing by that column while preserving selection semantics

### Requirement: File open behavior
Cagnard SHALL open supported files and objects through an explicit user action based on normalized metadata, content type, file category, size limits, storage capabilities, and registered file opener plugins.

#### Scenario: Open supported MIME type
- **WHEN** the user opens an entry with a supported MIME type and accessible content
- **THEN** Cagnard SHALL render the file in an appropriate in-app opener without requiring the user to download it manually

#### Scenario: Refuse unsafe or unsupported open
- **WHEN** the entry is too large, has an unsupported type, or lacks required storage capabilities
- **THEN** Cagnard SHALL decline in-app opening and offer available alternative actions

#### Scenario: Open supported text file
- **WHEN** the selected file is a supported text-like file within the opener size limit
- **THEN** Cagnard SHALL display the content in a text-capable opener rather than the browse metadata panel

### Requirement: Metadata comparison
Cagnard SHALL provide a normalized metadata view for size, MIME type, file category, owner, permissions, modified time, version, retention, and encryption state across providers.

#### Scenario: Compare normalized metadata
- **WHEN** the user selects entries from different providers
- **THEN** Cagnard SHALL show comparable normalized metadata fields for each entry

#### Scenario: Show unavailable metadata explicitly
- **WHEN** a provider cannot supply a normalized metadata field
- **THEN** Cagnard SHALL display that field as unavailable rather than blank or false

#### Scenario: Compare modified time
- **WHEN** the provider supplies a modified timestamp for an entry
- **THEN** Cagnard SHALL display the timestamp as normalized metadata and allow sorting by it in the browser listing

### Requirement: File type display
Cagnard SHALL display file type and icon metadata in browser listings and file metadata surfaces when the information can be classified safely.

#### Scenario: Show classified file type
- **WHEN** a listed entry has a known MIME type, extension, or category
- **THEN** Cagnard SHALL show the corresponding type label or icon without provider-specific UI logic

#### Scenario: Show unknown file type
- **WHEN** a listed entry cannot be classified
- **THEN** Cagnard SHALL show a generic unknown or binary file representation while preserving available actions
