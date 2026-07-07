## ADDED Requirements

### Requirement: Native browser history navigation
Cagnard SHALL integrate storage-browser navigation with native browser Back and Forward controls.

#### Scenario: Navigate back through directories
- **WHEN** the user navigates across storage roots or directories and then activates the browser Back button
- **THEN** Cagnard SHALL restore the previous accessible storage root and path instead of leaving the UI unchanged

#### Scenario: Navigate forward after back
- **WHEN** the user has gone back through Cagnard navigation history and then activates the browser Forward button
- **THEN** Cagnard SHALL restore the next accessible storage root and path

#### Scenario: Restore opened file view
- **WHEN** browser history points to a page-level opened file view
- **THEN** Cagnard SHALL restore the containing storage location and open that file when it remains accessible

#### Scenario: Fallback from inaccessible history target
- **WHEN** a browser history entry references a root, directory, or opened file that the current user cannot access
- **THEN** Cagnard SHALL route to an accessible fallback location and show a non-blocking error

#### Scenario: Avoid duplicate history entries
- **WHEN** Cagnard restores state from the URL or from a native browser history event
- **THEN** it SHALL NOT immediately push duplicate history entries for the restored state

## MODIFIED Requirements

### Requirement: Breadcrumb navigation
Cagnard SHALL show breadcrumb navigation for the current directory or opened file, allow returning to any ancestor path in the active storage root, and provide a copyable user-visible path for the current location.

#### Scenario: Navigate to ancestor
- **WHEN** the user activates a breadcrumb ancestor
- **THEN** Cagnard SHALL list entries for that ancestor path in the same storage root

#### Scenario: Navigate to root
- **WHEN** the user activates the root breadcrumb
- **THEN** Cagnard SHALL list the storage root path

#### Scenario: Label root breadcrumb
- **WHEN** the active storage root has a display label or nice name
- **THEN** Cagnard SHALL use that label for the root breadcrumb instead of a generic root label

#### Scenario: Show opened file in breadcrumb
- **WHEN** the user opens a file in the page-level opener
- **THEN** Cagnard SHALL show the opened file name as the final current breadcrumb segment after its containing directory path

#### Scenario: Keep opened file crumb non-directory
- **WHEN** the opened file breadcrumb segment is current
- **THEN** Cagnard SHALL NOT treat that segment as a directory navigation target

#### Scenario: Reveal copy path action
- **WHEN** the user hovers or focuses the breadcrumb area
- **THEN** Cagnard SHALL reveal a copy-path action at the end of the breadcrumb trail without shifting breadcrumb layout

#### Scenario: Copy current readable path
- **WHEN** the user activates the breadcrumb copy-path action while browsing a directory or viewing a page-level opened file
- **THEN** Cagnard SHALL copy the current full user-visible path to the browser clipboard using the displayed storage root name and real path segment names

#### Scenario: Report clipboard failure
- **WHEN** browser clipboard access fails
- **THEN** Cagnard SHALL notify the user without changing the current browser selection or location
