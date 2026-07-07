# Proposal

## Summary

Improve Cagnard's task queue so transfer tasks are stable, understandable, and controllable from the UI. A copy or move request should remain one task from creation through conflict resolution, execution, completion, cancellation, or failure. The task list should expose the affected files, per-file progress, conflict state, cancellation controls, and safe cleanup behavior without duplicating tasks when the server resumes work after a user decision.

## Motivation

The current transfer queue can show confusing duplicate entries when a conflict pauses a transfer and the user later resolves it. This makes it hard to understand whether one operation or multiple operations are running, especially for recursive directory copies where conflicts may occur below the visible destination directory.

Users also need clearer control over long-running operations:

- see whether a task is pending, blocked, running, completed, canceled, or failed;
- expand a task to inspect affected files and per-file progress;
- cancel tasks at any time;
- clear old queue entries;
- understand user-facing errors while keeping detailed diagnostics in server logs;
- have pasteboard items removed as soon as the user starts a copy or move, not after the transfer finishes.

## Scope

This change covers frontend and backend task queue behavior for storage operations, with transfer tasks as the primary target.

In scope:

- Stable task identity across pending, blocked, resumed, running, completed, canceled, and error states.
- Conflict decisions attached to the existing task instead of creating replacement tasks in the UI.
- Task queue UI with expandable affected-file details.
- Per-file state and progress display for recursive and multi-item transfers.
- Queue clearing and task cancellation controls.
- Pasteboard removal of selected items immediately when copy or move is invoked.
- Safe user-facing errors and detailed server-side logs for administrators.

Out of scope:

- Durable server-side task history across backend restarts.
- Background workers that continue after the current stateless backend process exits.
- A full audit log product surface.
- Provider-native resumable upload/download beyond the existing transfer strategy.

## Desired Behavior

Task lifecycle states:

- `pending`: task was accepted and is waiting to be processed.
- `blocked`: task is waiting for a user decision, such as a conflict policy.
- `canceled`: user canceled the task or closed/refused the required decision.
- `running`: task is actively processing and reports progress.
- `completed`: task finished successfully.
- `error`: task failed and exposes a safe user-facing error.

Task uniqueness:

- A user action creates one task id.
- If a conflict occurs, that same task becomes `blocked`.
- Resolving the conflict resumes the same task id.
- The UI updates the existing task entry rather than appending a new one.

Task details:

- Each task can expand to show affected files.
- Affected files show name, source/destination context, state, progress, and any safe per-file error.
- While running, affected files are ordered by state with running items first, then completed items, and by name within state groups.

Controls:

- The user can cancel a pending, blocked, or running task.
- The user can clear terminal tasks from the queue.
- Clearing the queue does not cancel running work unless the user explicitly cancels it.
- Completed and canceled tasks are automatically pruned after 1 hour.

Pasteboard:

- When the user clicks Copy or Move from the pasteboard, selected pasteboard items are immediately removed from the pasteboard.
- The task queue becomes the source of truth for the in-progress operation and any retry/error details.

## Risks

- Recursive transfers may involve many files. Task affected-file details should be paginated so the UI remains responsive for large directory transfers.
- Cancellation semantics differ by provider. The backend should stop scheduling new work and abort active streams where supported, then report any partial destination state.
- Conflict decisions must be correlated to the existing task id. The API should reject stale or unknown conflict decisions rather than creating hidden duplicate work.

## Decisions

- Completed and canceled tasks SHALL be automatically pruned after 1 hour.
- Per-file task details SHALL be paginated for large directory transfers.
