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
