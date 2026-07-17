## ADDED Requirements

### Requirement: Generic storage task operations
Cagnard SHALL represent copy, move, delete, download, and upload as user-scoped tasks in one queue using common lifecycle, progress, detail, cancellation, retention, and diagnostic models.

#### Scenario: Preserve copy and move tasks
- **WHEN** a user starts a copy or move operation
- **THEN** Cagnard SHALL execute it through the generic task queue without losing existing conflict resolution, recursive progress, or cross-provider behavior

#### Scenario: Create batch delete task
- **WHEN** a user confirms deletion of one or more selected entries
- **THEN** Cagnard SHALL create one delete task containing the selected entries and any recursively discovered descendants

#### Scenario: Create download task
- **WHEN** a user downloads one or more files or directories
- **THEN** Cagnard SHALL create one download task that tracks preparation and provider-to-browser delivery

#### Scenario: Create upload task
- **WHEN** a user selects one or more files or a directory tree for upload
- **THEN** Cagnard SHALL create one upload task with independently tracked file items

### Requirement: Task operation context
Cagnard SHALL expose operation-neutral task identity and operation-specific context without requiring the UI to interpret backend object representations.

#### Scenario: Identify operation
- **WHEN** the UI lists a task
- **THEN** the task SHALL identify its operation as `copy`, `move`, `delete`, `download`, or `upload` and expose a user-facing summary

#### Scenario: Authorize task access
- **WHEN** a user lists, reads, resolves, cancels, streams, or clears a task
- **THEN** Cagnard SHALL permit the action only for the task owner and SHALL return a safe not-found response for another user's task

#### Scenario: Use stable serialized identifiers
- **WHEN** a task or affected item is returned through the API
- **THEN** Cagnard SHALL return a stable serialized identifier and SHALL NOT expose language runtime object identities

### Requirement: Initiating location and mutation outcome
Cagnard SHALL retain the normalized browser directory from which each mutating task was started and SHALL report whether the task changed provider data.

#### Scenario: Record initiating directory
- **WHEN** a copy, move, delete, or upload task is created from a browser directory
- **THEN** Cagnard SHALL store its tunnel, storage root id, and normalized directory path as the task initiating location

#### Scenario: Report mutations after success
- **WHEN** a mutating task creates, changes, moves, or deletes one or more entries
- **THEN** Cagnard SHALL expose a positive mutation count on the task

#### Scenario: Report partial mutations
- **WHEN** a mutating task is canceled or fails after changing some entries
- **THEN** Cagnard SHALL preserve the changed item results and expose a positive mutation count instead of describing the operation as unchanged

### Requirement: Stream-bound task lifecycle
Cagnard SHALL track streaming download and upload work without buffering complete file content in task memory.

#### Scenario: Wait for download consumer
- **WHEN** a download task has been created but its authenticated content endpoint has not been requested
- **THEN** Cagnard SHALL keep it pending and expose the download action required to start delivery

#### Scenario: Track browser delivery
- **WHEN** the browser consumes a download task content endpoint
- **THEN** Cagnard SHALL mark the task running, update delivery progress, and complete it only after the response stream finishes successfully

#### Scenario: Track browser-fed upload
- **WHEN** the browser streams an upload item to its task endpoint
- **THEN** Cagnard SHALL update item and task progress as bytes are accepted and written to the destination provider

#### Scenario: Cancel active stream
- **WHEN** a user cancels a running download or upload task
- **THEN** Cagnard SHALL cancel the active request and provider operation where supported, stop scheduling remaining items, and retain safe partial results

#### Scenario: Browser disconnects
- **WHEN** a download or upload request disconnects before its stream completes
- **THEN** Cagnard SHALL stop the associated provider work and report the affected item as canceled or error without claiming completion

### Requirement: Generic task detail and progress
Cagnard SHALL expose paginated affected-item details and operation-appropriate progress for every task type.

#### Scenario: Show recursive delete details
- **WHEN** a recursive delete task discovers descendants
- **THEN** Cagnard SHALL expose their paths and deletion states incrementally and aggregate them into the selected parent item

#### Scenario: Show archive download details
- **WHEN** a download task packages multiple files or directories
- **THEN** Cagnard SHALL expose discovered archive entries, source-byte progress, and browser-delivery progress without treating compressed bytes as the known source total

#### Scenario: Show upload details
- **WHEN** a multiple-file or directory upload runs
- **THEN** Cagnard SHALL expose each relative target path, accepted bytes, known file size, state, and safe failure message

#### Scenario: Order generic active details
- **WHEN** a task has affected items in different states
- **THEN** Cagnard SHALL order running items first, then pending or blocked items, then terminal items, with name ordering inside each state group

#### Scenario: Paginate generic details
- **WHEN** any task contains more affected items than one response page
- **THEN** Cagnard SHALL paginate its details with stable task-item references while preserving aggregate task progress

### Requirement: Generic task concurrency
Cagnard SHALL bound parallel item processing for long-running storage tasks through task configuration.

#### Scenario: Use default item concurrency
- **WHEN** no generic task item concurrency is configured
- **THEN** Cagnard SHALL process at most 4 eligible child items concurrently for copy, move, delete, and upload work

#### Scenario: Configure item concurrency
- **WHEN** `tasks.maxConcurrentItems` is configured with a valid positive value
- **THEN** Cagnard SHALL use that value as the common child-item concurrency limit

#### Scenario: Preserve transfer configuration compatibility
- **WHEN** `tasks.maxConcurrentTransfers` is configured and the generic setting is absent
- **THEN** Cagnard SHALL use the existing transfer value as a compatibility fallback and document the generic replacement
