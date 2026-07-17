## 1. Context-aware action model

- [x] 1.1 Add a pure toolbar context resolver for page-level opened files, visible selections, inline previews, and empty-selection directory context
- [x] 1.2 Define deterministic download-source precedence as opened page file, selected entries, then current directory
- [x] 1.3 Extend the frontend data API so downloads can explicitly target an opened file, selected entries, or the current normalized directory
- [x] 1.4 Make contextual Refresh reload the active page-level viewer and preserve or confirm dirty editor state while directory Refresh continues to reload the listing
- [x] 1.5 Add unit tests for every toolbar state, stale hidden selection precedence, inline-preview semantics, root paths, and contextual refresh behavior

## 2. Complete current-directory downloads

- [x] 2.1 Allow an empty normalized source path for authorized download tasks while preserving traversal and absolute-path rejection
- [x] 2.2 Represent a configured storage root as a safe synthetic directory using its display label and no provider secrets or host paths
- [x] 2.3 Stream recursive filesystem-root downloads through the existing ZIP task path without enumerating frontend listing pages
- [x] 2.4 Stream recursive S3 bucket or configured-prefix root downloads through the same provider-neutral ZIP task path
- [x] 2.5 Generate safe meaningful archive and top-level directory names for root and nested current-directory downloads
- [x] 2.6 Enforce provider recursive-list and stream capabilities with actionable current-directory download errors
- [x] 2.7 Add Go tests for nested directories, empty root paths, filesystem roots, S3 prefix roots, pagination-independent contents, safe naming, authorization, cancellation, and unsupported capabilities
- [x] 2.8 Extend the MinIO integration suite to verify a streamed configured-prefix root archive and its hierarchy

## 3. Adaptive toolbar UI

- [x] 3.1 Remove the Open action group and add one directly accessible compact Refresh control using existing icon-button styling and accessible labeling
- [x] 3.2 Make Upload files primary with no selection and expose Upload folder plus Download current folder in its related menu
- [x] 3.3 Make Download primary for selected entries and page-level opened files while moving Upload files and Upload folder into the related menu
- [x] 3.4 Preserve one stable action-group slot and dimensions while labels, primary commands, and menus change
- [x] 3.5 Reuse existing dropdown hover, pinning, outside-click, keyboard, focus, disabled-state, theme, and border-hover behavior
- [x] 3.6 Add component tests for direct actions, menu contents, accessible names, keyboard operation, disabled reasons, and exact download target dispatch

## 4. Shared structured worker lifecycle

- [x] 4.1 Split structured worker client source closure from full client termination and make both operations idempotent
- [x] 4.2 Add a lazy per-tab structured runtime manager that deduplicates concurrent worker creation and grants unique source leases
- [x] 4.3 Reuse the healthy worker across sequential structured viewers while closing each source's reader state when its viewer unmounts
- [x] 4.4 Shut down the shared runtime on logout and unrecoverable worker failure and rely on page teardown as the final tab boundary
- [x] 4.5 Clear rejected or failed singleton initialization state so a viewer Retry creates a fresh worker
- [x] 4.6 Isolate request cancellation and source closure so one viewer cannot cancel another source's operation
- [x] 4.7 Add worker-client and runtime-manager tests for sequential opens, concurrent acquisition, React Strict Mode remounts, source cleanup, cancellation isolation, logout, fatal failure, and retry

## 5. Shared DuckDB-Wasm engine

- [x] 5.1 Introduce a concurrency-safe lazy DuckDB runtime inside the structured worker and initialize its selected local bundle, database settings, and approved Parquet extension once
- [x] 5.2 Give every Parquet source a unique safe registered filename and a source-owned DuckDB connection
- [x] 5.3 Change Parquet source cleanup to close its connection and unregister only its own file without terminating the shared engine
- [x] 5.4 Add runtime shutdown that closes remaining sources and terminates the DuckDB database and nested worker exactly once
- [x] 5.5 Distinguish malformed-file, query, timeout, and cancellation errors from fatal DuckDB runtime failures that require singleton invalidation
- [x] 5.6 Preserve same-origin content URL checks, local signed extension policy, bounded generated queries, range-only reads, response limits, and credential isolation
- [x] 5.7 Add tests proving multiple sequential Parquet files instantiate DuckDB and load the extension once, use unique registrations, clean up independently, isolate cancellation, and recover after fatal initialization

## 6. Documentation and UX verification

- [x] 6.1 Update browsing and transfer documentation with adaptive Upload/Download behavior, contextual Refresh, target precedence, and complete current-folder archives
- [x] 6.2 Update structured-data architecture, security, limits, and viewer documentation to describe shared per-tab runtime ownership and per-source cleanup
- [x] 6.3 Update task API or provider documentation for empty-path root download semantics and synthetic safe root naming
- [x] 6.4 Verify toolbar and dropdown behavior in the in-app browser at wide desktop, constrained desktop/tablet, and mobile widths in every supported light and dark theme
- [x] 6.5 Verify stable toolbar dimensions, no overlap or clipping, menu layering, hover bridges, outside-click closure, focus visibility, tooltips, loading states, and opened-view transitions with screenshots
- [x] 6.6 Verify first and subsequent Parquet opens in browser diagnostics so only the first healthy open initializes DuckDB-Wasm

## 7. Automated validation

- [x] 7.1 Run frontend type checking, unit/component tests, and the production build
- [x] 7.2 Run backend unit tests, vet, race-sensitive API tests, and focused download/provider tests
- [x] 7.3 Run Docker-backed MinIO S3 integration tests for root-prefix archives and Parquet range access
- [x] 7.4 Run documentation validation, strict OpenSpec validation, and repository diff checks
