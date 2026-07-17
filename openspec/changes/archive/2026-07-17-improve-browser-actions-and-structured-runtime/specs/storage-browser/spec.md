## ADDED Requirements

### Requirement: Context-aware browser toolbar actions
Cagnard SHALL derive the primary browser toolbar actions from the visible browsing context while preserving stable control dimensions and established interaction patterns.

#### Scenario: Refresh directory listing
- **WHEN** the file list is the active page surface
- **THEN** Cagnard SHALL show a directly accessible Refresh control that refreshes the current listing without presenting a redundant Open toolbar action

#### Scenario: Refresh opened file
- **WHEN** a page-level file viewer is the active page surface and the user activates Refresh
- **THEN** Cagnard SHALL reload that opened file through its viewer while preserving the current location and applicable viewer state where safe

#### Scenario: Prefer upload without a selection
- **WHEN** the file list is visible with no selected entries
- **THEN** Cagnard SHALL make Upload files the primary transfer action and SHALL expose Upload folder and Download current folder as related actions

#### Scenario: Prefer download for selected entries
- **WHEN** one or more entries are selected in the visible file list
- **THEN** Cagnard SHALL make Download the primary transfer action and target exactly the selected entries

#### Scenario: Prefer download for opened file
- **WHEN** a file is open in the page-level viewer
- **THEN** Cagnard SHALL make Download the primary transfer action and target the opened file instead of any stale selection from the hidden listing

#### Scenario: Preserve inline preview selection semantics
- **WHEN** a file is shown in an inline preview inside the listing
- **THEN** Cagnard SHALL continue to derive the transfer action and download target from the visible browser selection

#### Scenario: Integrate adaptive controls visually
- **WHEN** the toolbar changes its primary transfer action across browsing contexts
- **THEN** control dimensions and toolbar layout SHALL remain stable and the controls SHALL use Cagnard's existing border-hover, theme, focus, tooltip, keyboard, responsive, and dropdown behavior

### Requirement: Complete current-directory download
Cagnard SHALL allow the active directory to be downloaded through one task when no browser entries are selected, independently of listing pagination or filters.

#### Scenario: Download nested current directory
- **WHEN** the user chooses Download current folder while browsing a nested directory with no selection
- **THEN** Cagnard SHALL create one archive download task rooted at that complete directory rather than only downloading entries loaded on the current page

#### Scenario: Download configured storage root
- **WHEN** the user chooses Download current folder at an authorized filesystem or S3-compatible storage root
- **THEN** Cagnard SHALL represent the configured root or prefix as a safe synthetic directory and stream its complete accessible hierarchy into one archive

#### Scenario: Name root archive safely
- **WHEN** a configured storage root is downloaded
- **THEN** Cagnard SHALL derive a safe archive name and top-level directory label from the root display name without exposing an absolute filesystem path, bucket credential, or internal provider identifier

#### Scenario: Preserve current-directory scope
- **WHEN** the current listing is filtered, sorted, or paginated
- **THEN** Download current folder SHALL include the complete current directory hierarchy and SHALL NOT silently restrict the archive to visible results

#### Scenario: Reject unavailable directory download
- **WHEN** the active root cannot recursively list or stream the current directory according to its capabilities
- **THEN** Cagnard SHALL disable or reject Download current folder with an actionable user-facing explanation

