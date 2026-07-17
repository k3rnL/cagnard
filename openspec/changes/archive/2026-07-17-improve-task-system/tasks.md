## 1. Generic Task Foundation

- [x] 1.1 Define operation-neutral task, initiating-location, aggregate-progress, mutation-count, affected-item, page, and safe-error API models with stable serialized ids.
- [x] 1.2 Implement an owner-scoped in-memory task manager with validated state transitions, cancellable contexts, revision timestamps, one-hour terminal retention, and terminal-only clearing.
- [x] 1.3 Store affected items in a flat parent-linked index and implement stable state/name ordering plus opaque pagination without losing aggregate progress.
- [x] 1.4 Add common list, detail, paginated-item, cancel, resolve, and clear routes under `/api/tasks` with safe not-found behavior across users.
- [x] 1.5 Migrate copy and move execution from transfer response mutation into generic task runners while preserving recursive discovery, byte progress, conflict decisions, and task identity.
- [x] 1.6 Add temporary compatibility aliases for `/api/storage/transfer/jobs` and verify that aliases and generic routes address the same task records.
- [x] 1.7 Add backend tests for generic lifecycle transitions, owner isolation, stale decisions, pagination, retention, clearing, cancellation contexts, and copy/move compatibility.

## 2. Task Configuration And Provider Context

- [x] 2.1 Add `tasks.maxConcurrentItems` with validation, default 4, and `maxConcurrentTransfers` compatibility fallback in HOCON, Helm values, and example configuration.
- [x] 2.2 Introduce context-aware provider read, write, and recursive-delete contracts with discovery/progress callbacks and explicit partial outcomes.
- [x] 2.3 Update filesystem stream implementations to honor context, close resources promptly, and report bytes without changing existing range and preview behavior.
- [x] 2.4 Update S3 stream implementations to propagate context into SDK reads, writes, multipart state, and page or batch operations while preserving non-AWS compatibility settings.
- [x] 2.5 Add provider contract tests for cancellation before start, cancellation during I/O, unknown sizes, resource cleanup, and stable progress callbacks.

## 3. Generic Frontend Task Queue

- [x] 3.1 Replace transfer-specific frontend API types and client methods with generic task list, detail-page, cancel, resolve, clear, and operation creation methods.
- [x] 3.2 Migrate adaptive polling and task merging to revisions and generic active/terminal states without duplicating tasks after conflict resolution.
- [x] 3.3 Update the task queue trigger and panel with operation-specific copy, move, delete, download, and upload labels, statuses, summaries, progress, errors, and actions.
- [x] 3.4 Load paginated flat task items into the expandable detail view with state/name ordering and hierarchy presentation that does not use nested cards.
- [x] 3.5 Preserve accessible controls, theme behavior, constrained popup layout, responsive detail presentation, and the existing terminal retention/clear experience.
- [x] 3.6 Add frontend tests for generic task rendering, operation icons and labels, conflict reuse, pagination, cancellation, partial results, and polling transitions.

## 4. Location-Aware Refresh

- [x] 4.1 Include and validate normalized initiating tunnel, root id, and directory path on copy, move, delete, and upload task creation.
- [x] 4.2 Track mutation counts for successful and partial copy/move outcomes and expose them consistently on terminal tasks.
- [x] 4.3 Replace global task-completion refresh with exact initiating-location comparison and refresh only new terminal revisions with positive mutation counts.
- [x] 4.4 Refresh matching partial canceled/error outcomes, ignore unrelated roots and paths, and prevent initial terminal task loading or repeated polls from refreshing again.
- [x] 4.5 Add backend and frontend tests for same-path refresh, unrelated navigation, cross-tab polling behavior, partial mutation refresh, and repeated terminal responses.

## 5. Background Recursive Delete

- [x] 5.1 Implement filesystem recursive delete traversal that reports descendants, deletes children before directories, does not follow unsafe symlinks, and checks cancellation between operations.
- [x] 5.2 Implement S3 recursive prefix deletion with paginated enumeration, bounded batches, folder-marker handling, context propagation, and per-object retention/permission failures.
- [x] 5.3 Implement the generic delete runner and creation route for mixed selected files/directories with aggregate item progress, mutation counts, partial results, safe errors, and administrative logs.
- [x] 5.4 Replace synchronous frontend deletion loops with one confirmed background delete task, immediate selection clearing, and task-queue feedback.
- [x] 5.5 Explain irreversible partial deletion in confirmation and cancellation feedback without blocking independent eligible items.
- [x] 5.6 Add filesystem, S3, API, and frontend tests for batch deletion, deep trees, non-empty directories, cancellation, partial failure, authorization, and matching-location refresh.

## 6. Streaming Downloads And ZIP Generation

- [x] 6.1 Add owner-authorized download-task creation and content routes, keeping tasks pending until content consumption begins and rejecting stale, terminal, or foreign task URLs.
- [x] 6.2 Stream a single selected file through its task with safe content disposition, MIME type, content length, range support, source/delivery progress, cancellation, and disconnect handling.
- [x] 6.3 Implement incremental ZIP generation for multiple files, directories, and mixed selections using provider listing and stream-read operations without complete archive buffering.
- [x] 6.4 Sanitize archive paths, preserve selected hierarchy and modification times, handle duplicate names deterministically, emit meaningful filenames, and choose store or deflate per entry type.
- [x] 6.5 Report discovered ZIP items, source bytes, delivered bytes, unknown compressed total, item failures, partial-stream errors, and task completion accurately.
- [x] 6.6 Replace frontend Fetch-to-Blob downloads with task creation followed by an authenticated native browser download while keeping cancel and queue controls available.
- [x] 6.7 Add tests for large single files, ranges, mixed ZIP content, deep folders, empty directories, duplicate and malicious paths, S3 streams, cancellation, disconnect, and failures after headers.

## 7. Streaming Multi-File And Directory Uploads

- [x] 7.1 Replace `io.ReadAll` upload handling with direct context-aware provider `StreamWrite` and retain immediate content-editor save compatibility.
- [x] 7.2 Add upload manifest validation for destination authorization, safe relative paths, file sizes, MIME types, explicit empty directories, item limits, and known conflicts.
- [x] 7.3 Add stable owner-authorized per-item upload endpoints that stream request bodies, update progress and mutation counts, and reject duplicate or invalid item delivery.
- [x] 7.4 Implement blocked upload conflict handling for skip, keep-both, replace, or cancel decisions while retaining the original task id and undelivered browser files.
- [x] 7.5 Add frontend multiple-file selection, directory-picker or directory-input support, drag-and-drop relative paths, and explicit empty-directory manifest entries where available.
- [x] 7.6 Stream browser files with bounded concurrency and AbortControllers, coordinate backend cancellation, and mark undelivered items canceled/error when the browser session disappears.
- [x] 7.7 Add backend and frontend tests for large streaming uploads, multiple files, nested and empty directories, unsafe paths, conflicts, cancellation, disconnect, partial success, S3 writes, and exact-location refresh.

## 8. Documentation And Operational Guidance

- [x] 8.1 Rewrite task architecture documentation around the generic manager, three execution shapes, common API, cancellation, progress, and process-local limitations.
- [x] 8.2 Update browsing and transfer guides for background delete, native large download, ZIP selection download, multi-file/directory upload, conflicts, cancellation, and partial outcomes.
- [x] 8.3 Document `tasks.maxConcurrentItems`, the transfer compatibility fallback, reverse-proxy streaming timeout requirements, ZIP non-resumability, and browser-dependent upload lifetime.
- [x] 8.4 Update Docker, Helm, configuration reference, examples, and release documentation so every new setting and user workflow remains runnable from scratch.
- [x] 8.5 Update OpenAPI-like route references or API documentation and mark transfer-specific task routes as compatibility aliases scheduled for later removal.

## 9. End-To-End Verification

- [x] 9.1 Run Go formatting, vet, unit tests, race-sensitive task-manager tests, filesystem integration tests, and S3 plugin tests with MinIO.
- [x] 9.2 Run frontend typecheck, unit tests, production build, and fixture-based large upload/download checks without unbounded memory growth.
- [x] 9.3 Validate HOCON examples, Docker Compose examples, Helm lint/rendering, documentation links, and strict OpenSpec conformance.
- [x] 9.4 Exercise copy, move, delete, single download, ZIP download, single upload, folder upload, conflicts, cancellation, partial failures, and exact-path refresh in the in-app browser.
- [x] 9.5 Capture desktop and mobile screenshots of the generic task queue and verify popup layering, progress stability, keyboard access, theme consistency, and no content overlap.
