## Why

Cagnard's task queue is limited to copy and move while delete remains synchronous, downloads are buffered by the frontend, and uploads are buffered by the backend. Large and batch operations therefore fail or block the browser, and completed transfers refresh unrelated directories.

## What Changes

- Generalize transfer jobs into user-scoped tasks for copy, move, delete, download, and upload while preserving the existing lifecycle, progress, cancellation, retention, diagnostics, and paginated item details.
- Record the normalized browser location that initiated each mutating task and refresh a listing only when that exact location is still open and the terminal task changed provider data.
- Run batch and recursive deletion in the background with cooperative cancellation, provider-neutral progress, safe partial-result reporting, and provider-specific recursive deletion behavior.
- Replace frontend Blob buffering with task-backed direct streaming for large single-file downloads.
- Support downloading multiple files and directories as a ZIP archive generated incrementally from provider streams without buffering the complete archive or requiring persistent temporary storage.
- Replace backend upload buffering with provider streaming and support task-backed multiple-file and directory uploads with bounded concurrency, relative paths, cancellation, conflict handling, and per-file progress.
- Integrate the expanded task experience into Cagnard's established UI language, reusing its controls and interaction patterns while keeping the queue elegant, responsive, accessible, theme-compatible, and free of popup, overflow, loading, or layout regressions.
- Keep task state in memory and retain the documented single-active-backend limitation; durable or cross-replica task execution remains outside this change.
- **BREAKING**: Replace transfer-specific task API models and frontend terminology with generic task models. Compatibility aliases may be retained temporarily, but the first-party frontend will use the generic task API.

## Capabilities

### New Capabilities

None. The behavior extends the existing task, browser, and provider capabilities.

### Modified Capabilities

- `task-queue`: Generalize the queue to all long-running storage operations, add operation context and mutation-aware refresh information, and define delete, download, and upload task behavior.
- `storage-browser`: Add batch delete, multi-entry archive download, multi-file and directory upload, streaming behavior, and exact-location refresh semantics.
- `storage-plugin-system`: Require cancellable provider streaming and recursive deletion contracts with progress and safe partial-result semantics.

## Impact

- Backend API task models, routes, in-memory task manager, scheduling, cancellation contexts, and task-item pagination.
- Filesystem and S3 provider implementations for recursive deletion and context-aware streaming.
- Frontend API client, task queue, polling, completion refresh logic, download initiation, upload selection, progress, cancellation, responsive layout, themes, and interaction consistency.
- Runtime configuration and documentation for task concurrency, archive behavior, proxy timeouts, in-memory limitations, and browser upload constraints.
- Tests for large streams, recursive and partial deletion, ZIP path safety, folder upload paths, cancellation, authorization, and location-aware refresh.
