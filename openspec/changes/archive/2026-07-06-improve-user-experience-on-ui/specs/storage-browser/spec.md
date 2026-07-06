## MODIFIED Requirements

### Requirement: Breadcrumb navigation
Cagnard SHALL show breadcrumb navigation for the current path, allow returning to any ancestor path in the active storage root, and provide a copyable user-visible path for the current location.

#### Scenario: Navigate to ancestor
- **WHEN** the user activates a breadcrumb ancestor
- **THEN** Cagnard SHALL list entries for that ancestor path in the same storage root

#### Scenario: Navigate to root
- **WHEN** the user activates the root breadcrumb
- **THEN** Cagnard SHALL list the storage root path

#### Scenario: Label root breadcrumb
- **WHEN** the active storage root has a display label or nice name
- **THEN** Cagnard SHALL use that label for the root breadcrumb instead of a generic root label

#### Scenario: Reveal copy path action
- **WHEN** the user hovers or focuses the breadcrumb area
- **THEN** Cagnard SHALL reveal a copy-path action at the end of the breadcrumb trail without shifting breadcrumb layout

#### Scenario: Copy current readable path
- **WHEN** the user activates the breadcrumb copy-path action
- **THEN** Cagnard SHALL copy the current full user-visible path to the browser clipboard using the displayed storage root name and real path segment names

#### Scenario: Report clipboard failure
- **WHEN** browser clipboard access fails
- **THEN** Cagnard SHALL notify the user without changing the current browser selection or location

### Requirement: Readable location URL
Cagnard SHALL reflect the active browser location in the URL using readable user-facing storage names while preserving enough stable state to restore the provider-neutral location.

#### Scenario: Update URL on navigation
- **WHEN** the user navigates to a storage root or child path
- **THEN** Cagnard SHALL update the browser URL to represent the active tunnel, root, and path with readable names where practical

#### Scenario: Restore location from URL
- **WHEN** the user reloads the page or opens a copied URL in another tab
- **THEN** Cagnard SHALL restore the same location if the authenticated user can access that root and path

#### Scenario: Resolve ambiguous readable names
- **WHEN** readable root or path names are not unique enough to identify the location safely
- **THEN** Cagnard SHALL retain stable internal identifiers or encoded fallback state in the URL while keeping the visible path readable

#### Scenario: Reject inaccessible URL location
- **WHEN** the URL points to a root or path unavailable to the current user
- **THEN** Cagnard SHALL show a non-blocking error and route the user to an accessible default location

### Requirement: File open behavior
Cagnard SHALL open supported files and objects through a one-click user action based on normalized metadata, content type, file category, size limits, storage capabilities, and registered file opener plugins.

#### Scenario: Open supported MIME type
- **WHEN** the user clicks a file row with a supported MIME type and accessible content
- **THEN** Cagnard SHALL render the file in an appropriate in-app opener without requiring a separate Open button or double click

#### Scenario: Open directory
- **WHEN** the user clicks a directory row
- **THEN** Cagnard SHALL navigate into that directory without requiring a double click

#### Scenario: Preserve selection controls
- **WHEN** the user clicks a checkbox, multi-select control, row action menu, inline quick-view control, or command-bar action
- **THEN** Cagnard SHALL execute that control's action without also opening the file or directory row

#### Scenario: Refuse unsafe or unsupported open
- **WHEN** the entry is too large, has an unsupported type, or lacks required storage capabilities
- **THEN** Cagnard SHALL decline in-app opening and offer available alternative actions

#### Scenario: Open supported text file
- **WHEN** the selected file is a supported text-like file within the opener size limit
- **THEN** Cagnard SHALL display the content in a text-capable opener rather than the browse metadata panel

#### Scenario: Replace list with full opener
- **WHEN** the user opens a file through the main open action
- **THEN** Cagnard SHALL replace the file list with the opener surface while preserving breadcrumbs and applicable action controls

#### Scenario: Inline quick open
- **WHEN** the user activates quick view on a file row
- **THEN** Cagnard SHALL insert the opener surface inline between that file row and the next entry without leaving the current directory listing

### Requirement: Browser pending transition
Cagnard SHALL show navigation and file-opening pending states without inserting transient rows or text into the file list.

#### Scenario: Pending directory navigation
- **WHEN** the user opens a directory and the next listing is loading
- **THEN** Cagnard SHALL keep the current listing in place, visually mark it as pending, and show a lightweight spinner or equivalent progress affordance

#### Scenario: Pending file opening
- **WHEN** the user opens a file and the opener content is loading
- **THEN** Cagnard SHALL keep the current browser or opener surface stable, visually mark it as pending, and avoid adding a `Loading` row to the file list

#### Scenario: Avoid accidental interaction while pending
- **WHEN** a listing or opener is pending
- **THEN** Cagnard SHALL prevent accidental row activation caused by the pending overlay while keeping global navigation and safe controls available

#### Scenario: Cancel pending operation when supported
- **WHEN** the active request can be canceled safely
- **THEN** Cagnard MAY expose a cancel action in the pending overlay that aborts the request and restores the previous stable view
