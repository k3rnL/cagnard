## Purpose

Defines the browser-local pasteboard used to stage storage entry references and later copy or move them into the active destination.

## Requirements

### Requirement: Browser-local pasteboard
Cagnard SHALL provide a session-only browser-local pasteboard that holds selected storage entry references for later copy or move execution into the active destination.

#### Scenario: Add entries
- **WHEN** the user selects one or more entries and chooses to add them to the pasteboard
- **THEN** Cagnard SHALL add pasteboard items without mutating the source entries

#### Scenario: Choose paste operation
- **WHEN** the user invokes Paste or Move here from the pasteboard
- **THEN** Cagnard SHALL execute the selected pasteboard items with the chosen copy or move operation and SHALL NOT mutate source entries before a move destination succeeds

### Requirement: Pasteboard safe state
The pasteboard SHALL store only safe source references and display metadata, never raw provider credentials or file bytes, and SHALL NOT persist contents across full browser restarts or fresh application sessions.

#### Scenario: Hold pasteboard item
- **WHEN** an entry is added to the pasteboard
- **THEN** Cagnard SHALL store source tunnel, root id, path, entry kind, display name, root label, provider/account context, selected state, and display metadata

#### Scenario: Exclude secrets
- **WHEN** pasteboard state is held in memory or broadcast to another tab
- **THEN** it SHALL NOT include provider credentials, session tokens, downloaded content bytes, or backend-only authorization material

#### Scenario: Fresh browser session
- **WHEN** the app starts without an already-open same-origin tab that can provide pasteboard state
- **THEN** Cagnard SHALL start with an empty pasteboard

### Requirement: Pasteboard synchronization
Cagnard SHALL make pasteboard contents available across active same-origin browser tabs or windows during the current browser session when the frontend runtime supports it.

#### Scenario: Same-origin tab update
- **WHEN** a pasteboard item is added, removed, selected, or cleared in one tab
- **THEN** other same-origin tabs for the same authenticated user SHOULD receive the updated pasteboard state

#### Scenario: New tab joins active session
- **WHEN** a same-origin tab opens while another authenticated Cagnard tab is already active
- **THEN** the new tab MAY request the current pasteboard from the active tab without relying on durable storage

#### Scenario: User identity changes
- **WHEN** the authenticated user changes or logs out
- **THEN** Cagnard SHALL clear or isolate pasteboard contents so one user cannot see another user's staged entries

### Requirement: Pasteboard dropdown
Cagnard SHALL expose pasteboard contents through a command-bar dropdown or popover.

#### Scenario: Show pasteboard entries
- **WHEN** the user opens the pasteboard dropdown
- **THEN** Cagnard SHALL show staged entries with name, type, source provider/root/path context, selected state, and paste or move availability

#### Scenario: Manage pasteboard entries
- **WHEN** the pasteboard dropdown is open
- **THEN** the user SHALL be able to clear all entries, remove one entry, and select or deselect entries for paste

#### Scenario: Close dropdown
- **WHEN** the user clicks outside the pasteboard dropdown
- **THEN** Cagnard SHALL close the dropdown without clearing its entries

### Requirement: Paste into active destination
Cagnard SHALL paste selected pasteboard file and directory entries into the currently active storage root and current path.

#### Scenario: Paste selected entries
- **WHEN** the user invokes paste from the pasteboard dropdown
- **THEN** Cagnard SHALL use the active storage root and current path as the destination for selected pasteboard entries

#### Scenario: Paste directory entry
- **WHEN** a selected pasteboard entry is a directory
- **THEN** Cagnard SHALL transfer it recursively when the source and destination expose the required listing, create-directory, read, and write capabilities

#### Scenario: No eligible entries
- **WHEN** no selected pasteboard entries can be pasted into the active destination
- **THEN** Cagnard SHALL disable paste execution and show the eligibility reason

### Requirement: Pasteboard validation
Cagnard SHALL validate pasteboard entries at paste time before reading from sources or writing to destinations.

#### Scenario: Stale source
- **WHEN** a staged source no longer exists or is no longer readable
- **THEN** Cagnard SHALL skip or fail that item with a per-item diagnostic and SHALL NOT start a destination write for it

#### Scenario: Unsupported destination
- **WHEN** the active destination cannot accept writes for a staged item
- **THEN** Cagnard SHALL block that item before reading source content

#### Scenario: Unsupported recursive directory transfer
- **WHEN** a staged directory cannot be listed recursively or the destination cannot create required directories
- **THEN** Cagnard SHALL block that directory item before moving or deleting any source content

### Requirement: Pasteboard result reporting
Cagnard SHALL report batch paste results with enough detail for success, partial success, and failure.

#### Scenario: Partial batch result
- **WHEN** some pasteboard items succeed and others fail
- **THEN** Cagnard SHALL show per-item results and keep enough source context to let the user retry failed items

#### Scenario: Completed move item
- **WHEN** an item pasted with Move here is copied successfully and source deletion succeeds
- **THEN** Cagnard MAY remove that item from the pasteboard after reporting success
