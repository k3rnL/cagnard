## Context

The backend currently stores transfer jobs in memory and exposes transfer-specific models and routes. Copy and move already have task identity, recursive item trees, progress, conflict blocking, cancellation flags, one-hour retention, and adaptive frontend polling. Delete bypasses that machinery and calls each provider synchronously. Downloads stream at the HTTP layer but the frontend converts each response to a complete Blob. Uploads read complete request bodies before calling buffered provider APIs.

Cagnard intentionally requires no application database. Active task state is process-local, Helm defaults to one backend replica, and the documentation already states that restart or failover loses task state. This change must not introduce mandatory persistent temporary storage or imply cross-replica task safety.

The filesystem and S3 providers already expose stream read/write methods, but cancellation is indirect and recursive delete hides discovery and progress behind one call. The frontend task queue and polling behavior can be retained if the models become operation-neutral.

## Goals / Non-Goals

**Goals:**

- Use one task manager and API model for copy, move, delete, download, and upload.
- Preserve stable task identity, conflict resolution, paginated details, progress, cancellation, diagnostics, and one-hour terminal retention.
- Execute recursive batch delete in the background with provider-specific progress and cooperative cancellation.
- Stream large single-file downloads directly and create multi-entry ZIP files incrementally.
- Stream single, multiple, and directory uploads directly into providers with bounded concurrency.
- Refresh only the exact browser location that initiated a mutating task and only when mutations occurred.
- Preserve authorization boundaries and bounded memory for all new paths.

**Non-Goals:**

- Durable task history, distributed scheduling, or task migration across backend replicas.
- Continuing browser-selected uploads after the tab, browser, session, or source file handle disappears.
- Resuming partially generated ZIP downloads.
- Preparing complete download archives in local or shared temporary storage.
- Undoing completed deletes or other partial mutations after cancellation.
- Introducing a resumable upload protocol such as tus in this change.

## Decisions

### 1. Replace the transfer store with a generic in-memory task manager

Introduce a `TaskManager` that owns task records, owner checks, status transitions, cancellation functions, retention, scheduling, and paginated item details. Operation runners update the manager through a small internal interface rather than mutating API response structures directly.

A task record contains:

- stable task id, owner id, operation, status, safe message, timestamps;
- normalized initiating location for mutating operations;
- aggregate progress and mutation count;
- operation summary and optional destination or download descriptor;
- stable affected-item records with parent references rather than nested runtime objects;
- private runner state and a cancellable Go context.

Flat internally indexed items make pagination and stable ordering practical. The API may return parent ids and depth for tree presentation. Aggregates are stored or recomputed independently of the requested detail page.

Alternative: add separate delete, download, and upload stores. Rejected because lifecycle bugs, retention, authorization, polling, and UI behavior would diverge immediately.

### 2. Use common task retrieval with operation-specific creation endpoints

Use common lifecycle routes:

```text
GET  /api/tasks
GET  /api/tasks/{taskId}
GET  /api/tasks/{taskId}/items?pageRef=...
POST /api/tasks/{taskId}/cancel
POST /api/tasks/{taskId}/resolve
POST /api/tasks/clear
```

Use typed creation routes:

```text
POST /api/tasks/transfers
POST /api/tasks/deletes
POST /api/tasks/downloads
POST /api/tasks/uploads
```

Typed creation payloads avoid a weak JSON union while keeping one response model. Existing `/api/storage/transfer/jobs` routes remain temporary compatibility aliases during migration; the first-party frontend moves to `/api/tasks` in the same release.

### 3. Treat cancellation as context propagation plus partial outcome reporting

Each active task owns a `context.Context` and cancel function. Operation runners check it before discovery, scheduling, provider calls, and archive entries. Provider stream and recursive-delete APIs accept context and propagate it into filesystem loops and AWS SDK requests.

Cancellation is cooperative. Already completed writes and deletes remain completed. If a provider action is atomic or cannot be interrupted, the runner waits for that action, schedules no subsequent work, and records its real outcome. Terminal canceled or error tasks retain mutation counts and affected-item results.

Alternative: retain a polled boolean cancellation map. Rejected because it cannot promptly interrupt blocked I/O or browser-bound streams.

### 4. Implement recursive delete inside each provider contract

Add a context-aware recursive delete operation with an event callback for discovery, start, completion, and failure. The task engine handles authorization, selected root items, common status, and aggregation; the provider handles native path semantics.

- Filesystem deletion traverses without following symlinks outside the configured root, reports files and directories, and removes directories after children.
- S3 deletion enumerates the complete prefix through paginated SDK calls and deletes keys in bounded batches. Folder markers are ordinary reported objects. Retention, object-lock, and permission failures become item failures.
- Single files and objects use the same contract so the task runner has one path.

This does not change the current default meaning of S3 deletion to deleting visible/current objects rather than purging every historical version.

Alternative: recursively call generic `ListPage` and `Delete` from the task engine. Rejected because the engine would need provider-specific prefix, marker, batching, and consistency semantics.

### 5. Stream downloads on demand instead of preparing artifacts

Creating a download task returns an owner-authorized content URL. The task remains pending until that URL is consumed.

- One selected file is streamed as its original content with MIME type, content length, disposition, and byte ranges when supported.
- Multiple entries or any directory are emitted through Go's `archive/zip.Writer` directly to the HTTP response.
- ZIP paths are built from sanitized relative names, never absolute provider paths. Parent traversal, duplicate ambiguous names, and separator variants are rejected or deterministically renamed.
- ZIP entries preserve provider modification times; entries without one use a single archive-creation timestamp rather than the ZIP zero date.
- Compression is selected per entry: already compressed media and archive formats use ZIP store mode, while suitable text-like files use deflate.
- Source bytes processed and response bytes delivered are separate counters because compressed response size is unknown in advance.

The browser starts the returned URL through a native download navigation instead of Fetch-to-Blob. Task cancellation closes the response pipeline through context; browser disconnect cancellation is detected through the request context. Once headers are sent, later failures are visible in the task and logs because an HTTP JSON error cannot replace a partial archive.

Alternative: build a complete archive in `/tmp` or an internal provider and expose it when ready. Rejected for the initial implementation because it doubles I/O, requires capacity and cleanup policy, delays delivery, and is unsafe across replicas without shared durable state. It remains a future strategy for resumable archives.

### 6. Model uploads as a manifest plus browser-fed item streams

The browser first submits an upload manifest containing safe relative paths, sizes, MIME types, and explicit empty directories. The backend validates authorization, target paths, capability, total/item limits, and conflicts before returning the task and stable item upload endpoints.

The frontend sends file bodies directly to item endpoints with bounded concurrency. Each request streams through `StorageProvider.StreamWrite`; it never uses `io.ReadAll`. The server counts bytes as they pass into the provider. The frontend keeps AbortControllers for active requests and also invokes task cancellation so both sides stop.

If a target conflict exists, the task enters `blocked` before the affected body is required. A skip, keep-both, replace, or cancel decision updates the same task. The frontend retains browser File references while the task remains active. Reloading or closing the browser makes undelivered items unavailable, so the task becomes canceled or error rather than claiming background continuation.

Directory selection uses safe relative paths from drag-and-drop traversal, the directory picker where available, or `webkitdirectory` as a compatibility input. Empty directories are explicit manifest items because a file list cannot otherwise represent them.

### 7. Refresh by exact initiating location and mutation transition

Mutating creation requests include the current normalized `{tunnel, rootId, path}`. The backend validates the root and normalizes the path before storing it. It returns this location plus `mutationCount` on all task reads.

The frontend compares newly terminal task revisions against the currently displayed normalized location. It refreshes only when all three location components match and `mutationCount > 0`. It also refreshes partial canceled/error outcomes. Terminal tasks loaded during initial application startup do not trigger refresh, and repeated polls of the same terminal revision do not trigger again.

This intentionally follows the initiating directory rather than attempting broad overlap analysis. A task that affects another directory does not refresh whatever directory the user happens to view later.

### 8. Generalize child-item concurrency while preserving configuration compatibility

Add `tasks.maxConcurrentItems`, defaulting to 4, for eligible copy, move, delete, and upload child work. If it is absent, `tasks.maxConcurrentTransfers` remains a compatibility fallback. Generated ZIP reads remain sequential initially to preserve archive order and bounded memory.

The limit bounds scheduled item work, not the number of users or top-level tasks. Broader fairness and global admission control can be added separately if real workloads require them.

### 9. Keep task ownership and stream URLs session-authorized

Every task route resolves the current identity and checks task ownership. Download and upload URLs contain opaque task/item ids only; they never encode provider credentials, absolute filesystem paths, buckets, or account secrets. Storage roots and permissions are resolved again before provider access where necessary.

Upload relative paths and ZIP entry names use one canonical path sanitizer. HTTP filenames use safe content-disposition encoding. Logs include task and item ids plus administrative provider context but exclude credentials and file content.

## Risks / Trade-offs

- **In-memory tasks fail across restart or replicas** -> Preserve the documented single-active-backend limitation, default to one replica, and make no durability claims.
- **A native download may route to a different replica than task creation** -> This remains unsupported with process-local tasks; document session affinity or one replica until a durable task store exists.
- **Canceling delete leaves irreversible partial results** -> Confirm destructiveness before creation, show mutation progress, and refresh the matching initiating location after cancellation.
- **ZIP output can fail after response headers** -> Surface the authoritative failure in task state and logs, stop the stream, and never mark the task completed.
- **Archive size and compression ratio are unknown** -> Report source and delivered bytes separately and use an indeterminate delivered-total UI.
- **Directory enumeration can be very large** -> Paginate exposed task details, bound concurrency, retain aggregate counters, and avoid holding file contents in memory.
- **Browser upload cannot survive reload** -> State this in the UI and documentation; resumable persisted upload sessions are a separate capability.
- **S3 batch deletion may partially fail because of retention or permissions** -> Preserve per-object outcomes and continue independent eligible batches where safe.
- **Generic API migration can break older clients** -> Keep transfer route aliases for one compatibility window and document the replacement.

## Migration Plan

1. Introduce generic task models and manager behind the current transfer routes, preserving copy/move behavior and tests.
2. Add common task routes and migrate the first-party frontend queue, polling, cancellation, conflict resolution, and item pagination.
3. Add initiating location and mutation count, then replace global terminal refresh with exact-location refresh.
4. Extend provider contracts and implement recursive delete tasks for filesystem and S3.
5. Add task download creation and direct single-file/streaming ZIP consumption; remove frontend Blob downloads.
6. Change upload handling to stream writes, then add upload manifests and multiple/directory upload UI.
7. Add the generic concurrency setting, compatibility fallback, examples, deployment caveats, and operator documentation.
8. Retain compatibility transfer routes for this release. Rollback can return the frontend to those aliases while leaving the generic manager in place.

## Open Questions

None blocking. ZIP is the default multi-entry format, streamed artifacts are not spooled, task state remains in memory, and browser-fed uploads do not promise continuation after browser closure.
