## MODIFIED Requirements

### Requirement: Capability-driven browser actions
Cagnard SHALL enable search, open, download, upload, create file, create folder, rename, add-to-pasteboard, paste-copy, paste-move, and delete actions only when the selected provider, account, storage entry, active destination, and registered UI capabilities expose the required capabilities.

#### Scenario: Enable available action
- **WHEN** a selected storage entry supports download and a compatible opener is available
- **THEN** Cagnard SHALL offer download and open actions for that entry

#### Scenario: Disable unavailable action
- **WHEN** a selected storage entry does not support delete
- **THEN** Cagnard SHALL show delete as unavailable or omit it according to the UI policy

#### Scenario: Enable pasteboard staging
- **WHEN** one or more selected entries can be referenced safely for later copy or move execution
- **THEN** Cagnard SHALL allow adding them to the browser pasteboard

#### Scenario: Enable paste into active destination
- **WHEN** the pasteboard has selected items and the active destination supports the required write capabilities
- **THEN** Cagnard SHALL enable Paste or Move here actions for the active location according to destination and source capabilities

### Requirement: Basic file actions
Cagnard SHALL support download, upload, create file, create folder, rename, delete, add to pasteboard, and pasteboard-driven copy or move actions for the active storage root when the root, selected entries, and destination expose the required capabilities.

#### Scenario: Create file
- **WHEN** the user creates a file in the current directory
- **THEN** Cagnard SHALL create the file and refresh the listing

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

#### Scenario: Add to pasteboard
- **WHEN** the user adds selected entries to the pasteboard
- **THEN** Cagnard SHALL stage references to those entries without copying or moving data immediately

### Requirement: Same-root copy and move
Cagnard SHALL support copy and move within the active storage root through the pasteboard workflow and MAY use optimized same-root provider operations when they preserve requested semantics.

#### Scenario: Copy file within root
- **WHEN** the user chooses Paste for a staged file in the same storage root
- **THEN** Cagnard SHALL create the target file without removing the source

#### Scenario: Move entry within root
- **WHEN** the user chooses Move here for a staged file or directory in the same storage root
- **THEN** Cagnard SHALL create the target entry and remove the source entry only after destination success

### Requirement: Grouped command bar
Cagnard SHALL keep primary browser actions directly clickable and group related secondary actions without forcing toolbar wrapping in normal desktop and tablet layouts, including pasteboard staging and paste actions.

#### Scenario: Primary action remains clickable
- **WHEN** a command has related secondary actions
- **THEN** Cagnard SHALL keep the primary action available as a direct button and expose secondary actions through a grouped menu or equivalent control

#### Scenario: Remove redundant up action
- **WHEN** breadcrumb navigation is available
- **THEN** Cagnard MAY omit a separate up action from the primary toolbar

#### Scenario: Show pasteboard action surface
- **WHEN** the browser command bar is visible
- **THEN** Cagnard SHALL expose a pasteboard control that shows staged item count and paste availability

### Requirement: Browser action modal behavior
Cagnard SHALL use normalized app-owned modals for browser action confirmation, text input, conflict choice, and detailed operation failures.

#### Scenario: Create through app modal
- **WHEN** the user creates or renames an entry
- **THEN** Cagnard SHALL collect the name through an app-owned modal with inline validation

#### Scenario: Confirm through app modal
- **WHEN** the user starts a destructive action
- **THEN** Cagnard SHALL confirm through an app-owned modal before mutating storage

#### Scenario: Avoid native dialogs
- **WHEN** a browser action requires user interaction
- **THEN** Cagnard SHALL NOT use native browser `alert`, `confirm`, or `prompt`
