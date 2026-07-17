## Purpose

Defines the provider-neutral browser experience, navigation, metadata, explicit file opening, and storage actions.
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
Cagnard SHALL support task-backed download, upload, recursive delete, add to pasteboard, and pasteboard-driven copy or move actions, plus immediate create file, create folder, and rename actions, when the active roots and entries expose the required capabilities.

#### Scenario: Create file
- **WHEN** the user creates a file in the current directory
- **THEN** Cagnard SHALL create the file and refresh the listing

#### Scenario: Create folder
- **WHEN** the user creates a folder in the current directory
- **THEN** Cagnard SHALL create the directory and refresh the listing

#### Scenario: Rename selected entry
- **WHEN** the user renames a selected file or directory
- **THEN** Cagnard SHALL update the entry name and refresh the listing

#### Scenario: Delete selected entries
- **WHEN** the user confirms deletion of one or more selected files or directories
- **THEN** Cagnard SHALL create a recursive delete task and update the initiating listing when terminal mutations are reported

#### Scenario: Upload selected content
- **WHEN** the user uploads one or more files or a directory tree to the current directory
- **THEN** Cagnard SHALL stream the content through one upload task and update the initiating listing when terminal mutations are reported

#### Scenario: Download selected content
- **WHEN** the user downloads one file, multiple files, or one or more directories
- **THEN** Cagnard SHALL stream a single original file or one generated ZIP through a download task

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

### Requirement: Search across storage providers
Cagnard SHALL support search through provider-native search when available and through clearly scoped fallback behavior when native search is unavailable.

#### Scenario: Use provider-native search
- **WHEN** the active provider exposes a native search capability
- **THEN** Cagnard SHALL execute search through that provider capability and show the provider and account scope of the results

#### Scenario: Explain limited search scope
- **WHEN** the active provider does not expose native search
- **THEN** Cagnard SHALL restrict search to an available fallback scope and identify that limitation to the user

### Requirement: Current-directory filtering and sorting
Cagnard SHALL allow the user to search and sort the active directory through backend listing options without changing the active storage root or path.

#### Scenario: Filter current directory
- **WHEN** the user enters a current-directory search term
- **THEN** Cagnard SHALL ask the backend for a filtered listing page and show the filtered result count when it is known

#### Scenario: Sort by metadata column
- **WHEN** the user sorts by name, type, size, modified time, MIME type, or file category
- **THEN** Cagnard SHALL ask the backend for a listing page ordered by that column while preserving page-scoped selection semantics

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

#### Scenario: Replace list with full opener
- **WHEN** the user opens a file through the main open action
- **THEN** Cagnard SHALL replace the file list with the opener surface while preserving breadcrumbs and applicable action controls

#### Scenario: Inline quick open
- **WHEN** the user activates quick view on a file row
- **THEN** Cagnard SHALL insert the opener surface inline between that file row and the next entry without leaving the current directory listing

### Requirement: Adaptive browser metadata surface
Cagnard SHALL show normalized metadata without making the file listing unusable at medium or small viewport widths.

#### Scenario: Show side metadata on wide screen
- **WHEN** the browser has enough horizontal space for the listing and metadata
- **THEN** Cagnard MAY show metadata as a side panel next to the file list

#### Scenario: Show metadata drawer on constrained screen
- **WHEN** the viewport is too narrow for a useful file list and side metadata panel
- **THEN** Cagnard SHALL expose metadata through a toggleable drawer or equivalent overlay instead of placing it below the list

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

### Requirement: Provider-neutral primary UI
Cagnard SHALL keep the primary browser workflow provider-neutral while allowing contextual access to provider-specific features.

#### Scenario: Avoid provider-specific primary controls
- **WHEN** the user browses mixed storage providers
- **THEN** Cagnard SHALL present common browser actions consistently and keep provider-specific actions in contextual extension surfaces

#### Scenario: Expose provider feature without clutter
- **WHEN** a selected provider exposes a feature that only applies to that provider
- **THEN** Cagnard SHALL expose the feature near the selected entry or account without changing unrelated provider views

### Requirement: Operation result feedback
Cagnard SHALL report browser operation results with enough detail to understand success, partial mutation, cancellation, provider rejection, and capability limitation without refreshing unrelated locations.

#### Scenario: Provider rejects operation
- **WHEN** a provider rejects an upload, rename, move, delete, or download operation
- **THEN** Cagnard SHALL show the canonical failure category and provider-specific diagnostic details when safe to display

#### Scenario: Immediate operation succeeds
- **WHEN** an immediate create or rename operation completes successfully
- **THEN** Cagnard SHALL refresh or update its affected storage location

#### Scenario: Task operation succeeds
- **WHEN** a mutating task completes successfully
- **THEN** Cagnard SHALL refresh only a currently open listing that exactly matches the task initiating location

#### Scenario: Target conflict
- **WHEN** an upload, copy, or move target already exists without overwrite approval
- **THEN** Cagnard SHALL block or reject the operation and show an actionable conflict message

#### Scenario: Mutation fails before change
- **WHEN** a mutation operation fails without changing provider data
- **THEN** Cagnard SHALL show a safe diagnostic message and preserve the current listing state

#### Scenario: Mutation ends after partial change
- **WHEN** a failed or canceled task reports one or more provider mutations
- **THEN** Cagnard SHALL show the partial result and refresh only the matching initiating location

### Requirement: Location-aware task completion refresh
Cagnard SHALL refresh a browser listing after a mutating task terminates only when the open location exactly matches the location from which that task was initiated and the task reports provider mutations.

#### Scenario: Refresh matching location
- **WHEN** a copy, move, delete, or upload task reaches a terminal state with mutations and the browser still shows the same tunnel, storage root, and normalized directory path
- **THEN** Cagnard SHALL refresh that listing and preserve unrelated navigation state where possible

#### Scenario: Ignore unrelated location
- **WHEN** a mutating task terminates after the user navigated to another path, root, or tunnel
- **THEN** Cagnard SHALL NOT refresh or disturb the currently displayed listing

#### Scenario: Refresh partial mutation
- **WHEN** a canceled or failed task reports that it changed entries and the initiating location remains open
- **THEN** Cagnard SHALL refresh the listing so partial results are represented accurately

#### Scenario: Avoid repeated refresh
- **WHEN** a terminal task is returned by later polls or initial page loading without a new terminal transition
- **THEN** Cagnard SHALL NOT repeatedly refresh its initiating location

### Requirement: Background batch deletion
Cagnard SHALL delete selected files and directories through a cancellable background task.

#### Scenario: Delete multiple entries
- **WHEN** a user confirms deletion of multiple selected entries
- **THEN** Cagnard SHALL create one delete task and clear the browser selection without waiting for all deletions to finish

#### Scenario: Delete non-empty directory
- **WHEN** a selected directory contains files or nested directories
- **THEN** Cagnard SHALL recursively delete it according to provider semantics and expose discovered item progress

#### Scenario: Cancel recursive delete
- **WHEN** a user cancels a running recursive delete
- **THEN** Cagnard SHALL stop remaining work where possible, retain already deleted items as partial results, and explain that deletion cannot be rolled back

### Requirement: Streaming task-backed downloads
Cagnard SHALL download large files and selected entry sets through provider-to-browser streams without constructing complete frontend Blobs.

#### Scenario: Download one file
- **WHEN** a user downloads one file
- **THEN** Cagnard SHALL stream the original bytes through an authenticated task content endpoint with content length and byte-range behavior when available

#### Scenario: Download multiple entries
- **WHEN** a user downloads multiple files, one or more directories, or a mixed selection
- **THEN** Cagnard SHALL generate one ZIP archive incrementally and stream it to the browser as the download task runs

#### Scenario: Preserve directory hierarchy
- **WHEN** selected directories contain nested entries
- **THEN** Cagnard SHALL preserve safe relative directory paths in the ZIP and SHALL NOT include absolute paths or parent traversal segments

#### Scenario: Preserve archive modification dates
- **WHEN** a downloaded file or directory exposes a provider modification time
- **THEN** Cagnard SHALL preserve that time in the ZIP entry and SHALL use the archive creation time when provider metadata has no usable date

#### Scenario: Name generated archive
- **WHEN** Cagnard generates a ZIP for one directory or a mixed selection
- **THEN** it SHALL provide a safe meaningful filename derived from the directory name or a timestamped Cagnard download name

#### Scenario: Cancel browser download
- **WHEN** the task or browser download is canceled before delivery completes
- **THEN** Cagnard SHALL stop provider reads where possible, mark incomplete items safely, and SHALL NOT report the partial browser file as a completed download

#### Scenario: Report streamed archive failure
- **WHEN** an item fails after ZIP response headers have been sent
- **THEN** Cagnard SHALL record the failure in the task queue and server logs even when an HTTP error body can no longer replace the partial archive response

### Requirement: Streaming batch and directory uploads
Cagnard SHALL upload single files, multiple files, and browser-selected directory trees through task item streams without buffering complete request bodies in backend memory.

#### Scenario: Stream large upload
- **WHEN** a user uploads a large file
- **THEN** the browser and backend SHALL stream it to the provider while reporting task progress and without loading the complete file into frontend or backend memory

#### Scenario: Upload multiple files
- **WHEN** a user selects multiple files
- **THEN** Cagnard SHALL create one upload task and send its file items with bounded concurrency

#### Scenario: Upload directory tree
- **WHEN** the browser supplies files with safe relative directory paths
- **THEN** Cagnard SHALL recreate that hierarchy below the chosen destination and track each file or explicit empty directory

#### Scenario: Reject unsafe upload path
- **WHEN** an upload manifest contains an absolute path, parent traversal, separator ambiguity, or a path outside the selected destination
- **THEN** Cagnard SHALL reject that item without writing outside the authorized storage root

#### Scenario: Resolve upload conflict
- **WHEN** one or more upload targets already exist
- **THEN** Cagnard SHALL block the existing upload task for a skip, keep-both, replace, or cancel decision and continue with the same task id after resolution

#### Scenario: Close browser during upload
- **WHEN** the browser tab or upload request closes before all file streams are delivered
- **THEN** Cagnard SHALL cancel or fail undelivered items and SHALL NOT imply that uploads continue independently of the browser session

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
