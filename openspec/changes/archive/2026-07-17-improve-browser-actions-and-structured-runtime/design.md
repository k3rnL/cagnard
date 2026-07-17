## Context

The browser opens entries by single click, but the first toolbar group still promotes a disabled or redundant Open action and hides Refresh in a dropdown. The transfer group always promotes Download and requires a selection even though the task-backed download implementation can recursively archive directories. A page-level viewer can also coexist with stale selection state from the hidden listing, making implicit download targeting unsafe.

Current-directory download has an important provider boundary: a nested directory can be resolved through `Stat`, but the normalized root path is empty. Download validation rejects that path and S3 intentionally does not expose its configured root as an object. Expanding visible children in the frontend is not acceptable because listings are paginated and may be filtered.

Structured viewers currently construct one `StructuredDataWorkerClient` per `StructuredDataView` mount. The worker then creates a separate nested DuckDB worker and database for every Parquet source. Cleanup terminates both workers and the database. This gives strong isolation but repeatedly pays WASM instantiation and extension loading costs; React Strict Mode can also mount, clean up, and mount the effect again during development.

## Goals / Non-Goals

**Goals:**

- Make Refresh a direct contextual action and remove the redundant toolbar Open action.
- Choose Upload or Download as the primary transfer action from explicit, testable UI state.
- Download an opened page-level file, selected entries, or the complete current directory with deterministic precedence.
- Support task-backed download of the configured filesystem or S3 root without enumerating a frontend page.
- Reuse one lazy structured worker and DuckDB engine per tab while cleaning up every file-specific resource.
- Preserve Cagnard's visual language, accessibility, responsive behavior, security controls, cancellation, and actionable errors.

**Non-Goals:**

- Changing single-click entry opening or inline-preview behavior.
- Caching complete storage objects, query results, or viewer state across browser restarts.
- Sharing workers or DuckDB memory across tabs, windows, users, or backend sessions.
- Adding arbitrary SQL, remote extensions, provider URLs, or new structured formats.
- Changing archive contents according to the current listing filter or sort order.

## Decisions

### Derive toolbar state through one pure context resolver

The toolbar will compute an explicit action context from the page-level opened file and visible selected entries. Target precedence is:

1. page-level opened file;
2. visible selected entries;
3. current directory.

An inline preview remains part of the browser listing and therefore uses selection semantics. The resolver will produce the primary transfer command, related menu commands, labels, disabled reasons, and download sources. Keeping this logic pure prevents rendering and action handlers from making different target decisions and supports a compact state-matrix test suite.

With no selection, Upload files is the direct primary action. Upload folder and Download current folder remain in the related menu. With a selection or page-level opened file, Download becomes direct and Upload files/folder move into the menu. The group remains in one stable toolbar slot so changing state does not resize or reorder the rest of the controls.

Alternative considered: keep Download permanently primary and merely enable it for the current directory. This does not satisfy the desired upload-first idle state and keeps a less common whole-directory operation overly prominent.

### Replace the Open menu group with contextual Refresh

The Open toolbar command will be removed because opening is already the primary row interaction. Refresh will use the established compact icon-button treatment, accessible name, tooltip, focus ring, and border-hover behavior. In browser context it refreshes the listing; in a page-level viewer it asks that opener to reload its source. It will not insert loading text or shift adjacent controls.

Alternative considered: preserve an Open dropdown to retain consistent grouping. It remains redundant, frequently disabled, and obscures Refresh.

### Send the current directory as one authoritative download source

The frontend will pass the current tunnel, root id, and normalized current path to the existing download-task API. It will not send visible children. The API will permit an empty normalized source path specifically for downloads and resolve it as a synthetic directory representing the authorized configured root. The synthetic entry uses the root display label for safe user-facing naming and carries no absolute filesystem path, bucket credentials, or raw provider configuration.

Nested paths continue through provider `Stat`. Root traversal uses existing provider-neutral list and stream operations from the configured filesystem root or S3 bucket/prefix. This keeps pagination and filtering out of archive semantics and avoids weakening the general provider `Stat("")` contract solely for one API workflow.

Alternative considered: teach every provider to stat its root. A task-local synthetic entry is narrower, avoids inventing an S3 object that does not exist, and still delegates recursive listing and reads to provider capabilities.

### Keep one shared structured worker client per tab

A module-level runtime manager will lazily create one `StructuredDataWorkerClient` and return source leases with unique IDs. Closing a viewer sends a source-close request but no longer terminates the healthy worker. Client APIs will distinguish `closeSource` from `shutdown`; the latter rejects pending requests, releases the worker, and clears the singleton reference.

The runtime manager will deduplicate concurrent acquisition with one promise. A rejected promise or unrecoverable worker error clears the cached instance so Retry can construct a new worker. Logout explicitly shuts down the manager; browser teardown remains a natural hard boundary because workers cannot survive their document.

Alternative considered: retain one worker per viewer but cache only DuckDB. A DuckDB instance cannot be safely shared across unrelated dedicated-worker realms, and the outer worker startup and module loading would still repeat.

### Keep one lazy DuckDB engine with per-source connections

Inside the structured worker, Parquet access will acquire a concurrency-safe lazy DuckDB runtime containing the selected bundle, nested worker, database, and once-loaded local Parquet extension. Each Parquet source receives:

- a unique safe virtual filename derived from its source ID;
- its own DuckDB connection;
- its own cancellation listeners and query timeout;
- cleanup that closes the connection and drops only that registration.

Source cleanup never terminates the shared database. Runtime shutdown closes all remaining sources before terminating DuckDB. A fatal DuckDB worker/database failure invalidates the shared engine, while malformed files, unsupported data, ordinary query errors, and user cancellation remain source-local failures.

Alternative considered: one connection and fixed registered filename for every file. That creates cleanup races when viewers remount or source close overlaps the next open, and cancellation could affect the wrong query.

### Preserve UI and runtime observability without layout churn

Initialization progress remains visible in the existing structured viewer loading surface, but it will distinguish first engine initialization from opening a new source. Adaptive toolbar controls reuse existing button/menu components and CSS tokens. Tests and browser screenshots will cover light/dark themes, wide and constrained viewports, hover/focus states, menu layering, stable dimensions, and opened-file/list transitions.

Documentation will be updated where it currently claims that closing every structured file terminates all workers.

## Risks / Trade-offs

- [A persistent DuckDB runtime retains WASM memory after closing a Parquet file] -> Keep it lazy, release all file registrations and connections promptly, terminate it on logout/fatal failure/page teardown, and document the per-tab memory trade-off.
- [A shared engine can allow one failed query to affect later files] -> Classify source-local errors separately from fatal runtime errors and invalidate the singleton only when the engine or worker is unhealthy.
- [Asynchronous source close can race with a newly opened source] -> Use unique source IDs, unique registered filenames, source-owned connections, and idempotent close operations.
- [React Strict Mode can still trigger duplicate source initialization] -> Share runtime initialization promises and make source cleanup safe; optionally delay disposal only at the source layer if tests prove a development-only overlap remains visible.
- [Root archives can be unexpectedly large] -> Continue using cancellable streaming download tasks with progress and provider capability checks; do not enumerate or buffer the hierarchy in the frontend.
- [Dynamic primary labels can resize the toolbar] -> Use the existing stable action-group dimensions and responsive rules, and verify visual state transitions at representative viewport widths.
- [Contextual Refresh may discard unsaved editor changes] -> Reuse the opener's existing dirty-state confirmation or block refresh until the user confirms, rather than silently replacing edited content.

## Migration Plan

1. Add pure toolbar/download target resolution and frontend tests without changing backend behavior.
2. Extend download task root handling and provider-neutral archive traversal tests for filesystem and S3 prefix roots.
3. Switch the toolbar to adaptive controls and verify all responsive/theme interaction states.
4. Split worker source close from runtime shutdown, introduce the shared client manager, and add lifecycle tests.
5. Refactor Parquet to the shared DuckDB engine with unique source resources and failure-recovery tests.
6. Update architecture and user documentation, run frontend/backend/integration suites, and verify the built app with browser screenshots.

Rollback can restore the previous toolbar resolver and per-view worker ownership without changing persisted data or configuration. The download task request shape remains compatible; only an empty path gains defined meaning for this authorized operation.

## Open Questions

None. The action precedence, root-download semantics, and per-tab runtime lifecycle are defined for implementation.
