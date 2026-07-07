# Task Queue

## Behavior

Cagnard uses the task queue for pasteboard copy and move operations and other long-running storage work. A user action creates one stable task id, and that id remains the visible operation through conflict resolution, progress, completion, cancellation, or failure.

Task statuses are normalized:

- `pending`: accepted and waiting to run
- `blocked`: waiting for a user conflict decision
- `running`: actively processing
- `completed`: finished successfully
- `canceled`: canceled by the user or by closing a required decision
- `error`: failed with a safe user-facing message

The queue button appears next to the pasteboard when tasks exist. It shows a spinner for active work, an issue marker for blocked/canceled/error tasks, and a success marker for recent completed tasks.

The frontend refreshes active transfer state with adaptive polling: newly started tasks are checked very frequently so progress appears quickly, then the polling interval backs off while the task remains active.

## Task Details

Each queue entry can be expanded. Expanded tasks show affected file rows with source context, destination context when available, item state, and per-file or per-item progress. Large detail lists are paginated in the UI.

Recursive directory transfers expose child file rows as the directory is processed. Parent directory tasks aggregate child counters, while the UI focuses the expanded list on leaf affected items so users see files instead of only the selected folder wrapper.

Running task details are ordered by state so active items appear before completed items, then by name inside each state group.

## Configuration

`tasks.maxConcurrentTransfers` controls how many child transfers a recursive task may run in parallel. The default is `4`.

## Conflict Resolution

Transfer conflicts are represented by `blocked` task state. Resolving a conflict posts the selected policy back to the same task id and resumes that task instead of creating another queue entry.

Canceling or dismissing the conflict decision cancels the task.

## Queue Management

Users can cancel pending, blocked, or running tasks. Cancellation is cooperative: Cagnard stops scheduling new work and asks active provider operations to stop where supported.

Users can clear terminal tasks from the visible queue. Completed and canceled tasks are also automatically pruned from backend memory after 1 hour. Task state is in-memory and is lost on backend restart.

## API Shape

Transfer tasks use:

- `POST /api/storage/transfer/jobs`
- `GET /api/storage/transfer/jobs`
- `GET /api/storage/transfer/jobs/{jobId}`
- `POST /api/storage/transfer/jobs/{jobId}/resolve`
- `POST /api/storage/transfer/jobs/{jobId}/cancel`
- `POST /api/storage/transfer/jobs/clear`

Detailed backend diagnostics are written to server logs with the task id. User-facing responses avoid secrets and raw provider credentials.
