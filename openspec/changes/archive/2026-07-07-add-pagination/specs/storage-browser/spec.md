## ADDED Requirements

### Requirement: Paginated file browsing
Cagnard SHALL browse the active directory through backend-provided pages rather than requiring the frontend to load every entry in that directory.

#### Scenario: Load first page
- **WHEN** the user opens a storage root or directory
- **THEN** Cagnard SHALL request the first backend page for that location and render only the entries returned for that page

#### Scenario: Navigate to next page
- **WHEN** the backend reports that another page is available
- **THEN** the browser SHALL allow the user to load the next page using the opaque page reference returned by the backend

#### Scenario: Navigate to previous page
- **WHEN** the user has already navigated forward through paginated results
- **THEN** the browser SHALL allow returning to previously visited pages without requiring provider-native backward pagination

#### Scenario: Unknown total count
- **WHEN** the provider cannot return an exact total count cheaply
- **THEN** the browser SHALL display the current page range and indicate that the total is unknown rather than showing a misleading zero or complete count

#### Scenario: Page-scoped selection
- **WHEN** the user selects all visible entries in a paginated directory
- **THEN** Cagnard SHALL select the entries on the current page only unless a future explicit cross-page selection mode is implemented

### Requirement: Backend-driven current-directory search and sorting
Cagnard SHALL apply current-directory search and sorting on the backend before page slicing so results describe the full current directory scope.

#### Scenario: Search full current directory
- **WHEN** the user enters a current-directory search term
- **THEN** the backend SHALL apply the search to the current directory scope before returning the first page of matching entries

#### Scenario: Sort full current directory
- **WHEN** the user sorts by name, kind, type, size, modified time, MIME type, or file category
- **THEN** the backend SHALL apply the requested sort to the current directory scope before returning the requested page

#### Scenario: Reset page on search or sort change
- **WHEN** the user changes the search term, sort key, sort direction, page size, active root, or active path
- **THEN** the browser SHALL discard current page references, clear page-scoped selection, and request the first page for the new criteria

#### Scenario: Avoid page-only transforms
- **WHEN** only one page of a larger result set is loaded
- **THEN** Cagnard SHALL NOT sort or filter only that loaded page and present it as a full-directory result

#### Scenario: Report unsupported or degraded criteria
- **WHEN** a provider cannot complete the requested search or sort exactly within configured limits
- **THEN** Cagnard SHALL show a safe error or explicit degraded-state message instead of silently returning partial results

## MODIFIED Requirements

### Requirement: Current-directory filtering and sorting
Cagnard SHALL allow the user to search and sort the active directory through backend listing options without changing the active storage root or path.

#### Scenario: Filter current directory
- **WHEN** the user enters a current-directory search term
- **THEN** Cagnard SHALL ask the backend for a filtered listing page and show the filtered result count when it is known

#### Scenario: Sort by metadata column
- **WHEN** the user sorts by name, type, size, modified time, MIME type, or file category
- **THEN** Cagnard SHALL ask the backend for a listing page ordered by that column while preserving page-scoped selection semantics
