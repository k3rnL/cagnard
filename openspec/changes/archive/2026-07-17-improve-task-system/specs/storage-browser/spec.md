## ADDED Requirements

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

## MODIFIED Requirements

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
