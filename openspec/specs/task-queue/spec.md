## Purpose

Defines the task queue used for pasteboard transfers and other long-running storage operations.
## Requirements
### Requirement: Unique task identity
Cagnard SHALL represent each user-started long-running operation as one task with a stable task id for the lifetime of that operation.

#### Scenario: Create one transfer task
- **WHEN** the user starts a pasteboard copy or move operation
- **THEN** Cagnard SHALL create exactly one task id for that operation and SHALL use that id for all later progress, conflict, cancellation, completion, and failure updates

#### Scenario: Resume blocked transfer
- **WHEN** a transfer task is blocked by a conflict and the user provides a decision
- **THEN** Cagnard SHALL resume the existing task id rather than creating another visible task in the queue

#### Scenario: Reject stale task decision
- **WHEN** the UI submits a conflict or cancellation decision for an unknown, terminal, or stale task id
- **THEN** Cagnard SHALL reject the decision with a safe user-facing error and SHALL NOT create replacement work

### Requirement: Task lifecycle states
Cagnard SHALL expose normalized task lifecycle states for long-running operations.

#### Scenario: Pending task
- **WHEN** a task is accepted but not yet processing
- **THEN** Cagnard SHALL report the task as `pending`

#### Scenario: Blocked task
- **WHEN** a task requires user input before it can continue
- **THEN** Cagnard SHALL report the task as `blocked` with the safe decision details required by the UI

#### Scenario: Canceled task
- **WHEN** the user cancels a task or declines the required decision
- **THEN** Cagnard SHALL report the task as `canceled`

#### Scenario: Running task
- **WHEN** a task is actively processing
- **THEN** Cagnard SHALL report the task as `running` with progress counters

#### Scenario: Completed task
- **WHEN** every required item in a task completes successfully
- **THEN** Cagnard SHALL report the task as `completed`

#### Scenario: Error task
- **WHEN** a task fails in a way that prevents completion
- **THEN** Cagnard SHALL report the task as `error` with a safe user-facing message

### Requirement: Conflict-blocked task decisions
Cagnard SHALL model transfer conflicts as blocked task state instead of separate browser operations.

#### Scenario: Conflict in nested transfer item
- **WHEN** a recursive transfer finds a destination conflict in a subdirectory
- **THEN** Cagnard SHALL mark the original task as `blocked` and expose the conflicting source and destination item enough for the UI to ask for a decision

#### Scenario: Resolve conflict
- **WHEN** the user chooses a conflict policy for a blocked task
- **THEN** Cagnard SHALL apply that decision to the existing task and continue processing according to the selected policy

#### Scenario: Cancel conflict dialog
- **WHEN** the user cancels or dismisses the conflict decision without choosing a policy
- **THEN** Cagnard SHALL cancel the blocked task and report it as `canceled`

### Requirement: Expandable task details
Cagnard SHALL let the UI expand each task to inspect affected files and item-level progress.

#### Scenario: Show affected files
- **WHEN** the user expands a task in the queue
- **THEN** Cagnard SHALL provide affected files with display name, source context, destination context, item state, byte progress when known, and safe item-level errors when applicable

#### Scenario: Show recursive transfer files while running
- **WHEN** a recursive directory transfer is running
- **THEN** Cagnard SHALL expose discovered child file tasks while the transfer is still active and SHALL aggregate their counters into the parent directory task

#### Scenario: Order running file details
- **WHEN** a task is running and has multiple affected files
- **THEN** Cagnard SHALL order affected files by item state with running items first, completed items after active items, and name ordering inside each state group

#### Scenario: Paginate large task details
- **WHEN** a task affects more files than can be returned comfortably in one response
- **THEN** Cagnard SHALL expose paginated affected-file details so the UI can load them incrementally

### Requirement: Task progress counters
Cagnard SHALL expose progress at both task and affected-file levels when the provider can report it.

#### Scenario: Report task progress
- **WHEN** a task transfers known bytes or known item counts
- **THEN** Cagnard SHALL report transferred bytes, total bytes, completed item count, and total item count

#### Scenario: Unknown totals
- **WHEN** the total byte count or item count is not known
- **THEN** Cagnard SHALL report the known transferred amount and identify the total as unknown rather than reporting zero

#### Scenario: Report file progress
- **WHEN** an affected file is actively transferring and byte progress is known
- **THEN** Cagnard SHALL expose item-level transferred bytes and total bytes for the file progress bar

#### Scenario: Report S3 stream progress
- **WHEN** a transfer reads from or writes to an S3-compatible provider through the provider-neutral stream path
- **THEN** Cagnard SHALL report byte progress without buffering the whole object in memory

### Requirement: Configurable transfer parallelism
Cagnard SHALL provide a backend configuration setting for recursive transfer parallelism.

#### Scenario: Default transfer parallelism
- **WHEN** no task concurrency setting is configured
- **THEN** Cagnard SHALL run recursive transfer child work with a default concurrency of 4

#### Scenario: Configured transfer parallelism
- **WHEN** `tasks.maxConcurrentTransfers` is configured
- **THEN** Cagnard SHALL use that value as the maximum child transfer concurrency for recursive transfer tasks

### Requirement: Task cancellation and queue clearing
Cagnard SHALL provide user controls for canceling tasks and clearing old queue entries.

#### Scenario: Cancel task
- **WHEN** the user cancels a pending, blocked, or running task
- **THEN** Cagnard SHALL stop scheduling additional work, cancel active provider operations where supported, preserve safe partial-state details, and report the task as `canceled`

#### Scenario: Clear terminal tasks
- **WHEN** the user clears the task queue
- **THEN** Cagnard SHALL remove completed, canceled, and error tasks from the visible queue without canceling active tasks

#### Scenario: Auto-prune completed and canceled tasks
- **WHEN** a task has been `completed` or `canceled` for 1 hour
- **THEN** Cagnard SHALL automatically remove it from the visible queue

### Requirement: Task error diagnostics
Cagnard SHALL separate safe user-facing errors from administrator diagnostics.

#### Scenario: Show safe error
- **WHEN** a task enters `error`
- **THEN** Cagnard SHALL show a concise user-facing error that explains the failed operation without exposing secrets

#### Scenario: Log diagnostic error
- **WHEN** a task fails because of provider, filesystem, network, permission, or internal errors
- **THEN** Cagnard SHALL write detailed diagnostic context to server logs with the task id and without logging credentials or secret tokens

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
