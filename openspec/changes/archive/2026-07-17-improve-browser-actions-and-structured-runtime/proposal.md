## Why

The browser toolbar currently gives a redundant Open command greater prominence than common transfer actions, while download behavior becomes unavailable when nothing is selected. Parquet viewing also rebuilds and destroys the complete DuckDB-Wasm runtime for every opened file, causing avoidable delay, resource churn, and duplicate initialization under React development remounts.

## What Changes

- Replace the Open action group with one consistent contextual Refresh control; entries remain opened through the established single-click interaction.
- Make the upload/download action group adapt to browser context: Upload files is primary with no selection, while Download is primary for selected entries or a page-level opened file.
- Allow Download current folder when nothing is selected, including the configured root of filesystem and S3-backed storage, without relying on the currently loaded paginated listing.
- Resolve download targets explicitly so an opened page-level file takes precedence over stale browser selection, selected entries take precedence while browsing, and an empty selection targets the current directory.
- Reuse one lazily initialized structured-data worker and one lazy DuckDB-Wasm engine per browser tab while keeping file registrations, connections, cancellation, and cleanup isolated per opened source.
- Preserve retry behavior by replacing a failed shared runtime, and release the runtime on logout, unrecoverable worker failure, or page teardown.
- Keep the updated controls visually consistent with Cagnard's existing sizing, border-hover treatment, themes, responsive toolbar behavior, tooltips, keyboard access, and dropdown interaction patterns.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `storage-browser`: Define context-aware refresh and upload/download primary actions, deterministic download targeting, and complete current-directory downloads including storage roots.
- `structured-data-file-inspection`: Define a lazy shared structured worker and DuckDB-Wasm lifecycle with isolated per-file resources, safe cleanup, and recovery after runtime failure.

## Impact

- Frontend browser toolbar composition and action state derivation in `StorageBrowser.tsx`.
- Frontend data actions in `useCagnardData.ts`, including explicit opened-file, selection, and current-directory download targets.
- Download task validation and root-directory handling in the Go API and filesystem/S3 provider boundary.
- Structured-data worker client ownership, source lifecycle protocol, and Parquet DuckDB runtime management.
- Browser action, download task, structured viewer, worker lifecycle, provider-root, accessibility, and responsive UI tests.
- Browser and structured-data documentation describing adaptive actions and per-tab analytical runtime behavior.
