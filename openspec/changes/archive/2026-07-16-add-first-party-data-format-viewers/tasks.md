## 1. Dependency and Access Spikes

- [x] 1.1 Build a minimal locally served DuckDB-Wasm worker spike that opens a Parquet fixture through the existing authenticated Cagnard content URL.
- [x] 1.2 Verify DuckDB-Wasm byte-range behavior, cookies, cancellation, and result bounds against both Unix filesystem and MinIO/S3 roots, then record whether the existing endpoint or a stateless scoped content handle will be used.
- [x] 1.3 Evaluate browser-compatible Avro OCF decoders and codec support against representative fixtures, select the dependency, and document the supported codec matrix.
- [x] 1.4 Evaluate Apache Arrow JavaScript behavior for IPC file, IPC stream, and Feather inputs and determine which variants require complete buffering.
- [x] 1.5 Benchmark representative desktop and mobile-sized fixtures to choose page, query-result, buffered Arrow, and worker memory limits.

## 2. First-Party Opener Registry

- [x] 2.1 Introduce typed first-party opener descriptors with matching, priority, content, capability, size, edit, save, and lazy-loader declarations.
- [x] 2.2 Migrate text, Markdown, JSON, YAML, diff, log, CSV, media, PDF, and archive openers from manifest-shaped defaults to the first-party registry without behavioral regressions.
- [x] 2.3 Update nested archive-entry routing to use the first-party registry without backend plugin manifests.
- [x] 2.4 Move frontend `plugins` modules and imports to first-party `openers` or `formats` ownership and remove plugin terminology from runtime types and UI text.
- [x] 2.5 Add registry tests for deterministic priority, MIME/category/extension matching, capability and size rejection, lazy loading, fallback, and unsupported files.

## 3. Remove the UI Plugin Contract

- [x] 3.1 Remove frontend UI-plugin API calls, response types, loading state, opener parameters, and startup requests.
- [x] 3.2 Remove backend `UIPluginConfig`, HOCON decoding, API manifest models, `GET /api/plugins/ui`, and related server tests.
- [x] 3.3 Add configuration validation that rejects the legacy top-level `uiPlugins` key with an actionable migration diagnostic.
- [x] 3.4 Remove `uiPlugins` declarations from canonical HOCON examples, Helm defaults and example values, and every runnable example.
- [x] 3.5 Add backend and frontend regression tests proving normal startup and file opening no longer depend on a UI-plugin endpoint or configuration section.

## 4. Classification and Test Data

- [x] 4.1 Align backend and frontend extension and MIME mappings for Parquet, Avro OCF, Arrow IPC/file/stream, Feather, NDJSON, CSV, and TSV.
- [x] 4.2 Add an analytical-data category, labels, and icons while preserving extension fallback when providers report generic binary MIME types.
- [x] 4.3 Separate NDJSON/JSON Lines classification and opener routing from ordinary JSON documents.
- [x] 4.4 Add catalog tests for canonical MIME values, practical aliases, generic provider MIME fallback, compound extensions, and unknown files.
- [x] 4.5 Create deterministic fixture generation for nested values, nulls, logical types, multiple blocks or batches, supported compression modes, malformed inputs, and range-sized data.
- [x] 4.6 Add safe generated structured-data fixtures to relevant filesystem and MinIO example seed data without committing private or excessive binary artifacts.

## 5. Worker and Structured-Data Contracts

- [x] 5.1 Define normalized schema, metadata, row-page, opaque cursor, operation-capability, filter, sort, projection, and structured error models.
- [x] 5.2 Define a request-ID-based worker protocol for initialize, inspect, page, query, cancel, close, progress, and error messages.
- [x] 5.3 Implement worker lifecycle management that aborts fetches, releases buffers and engine connections, ignores stale responses, and terminates idle workers.
- [x] 5.4 Add bounded payload enforcement and transferable-buffer handling at the worker boundary.
- [x] 5.5 Add unit tests for worker request correlation, cancellation races, stale response rejection, cleanup, payload limits, and error normalization.

## 6. Shared Structured-Data Viewer

- [x] 6.1 Build Data, Schema, and Metadata tabs within the existing page and inline opener surfaces while preserving breadcrumbs and file actions.
- [x] 6.2 Build a stable paginated data grid with column visibility, bounded cell dimensions, null and binary representations, and expandable nested list/map/struct/union values.
- [x] 6.3 Add schema-tree rendering for nested fields, physical and logical types, nullability, and format-specific field metadata.
- [x] 6.4 Add metadata sections for format, compression, blocks or batches, row groups, statistics, and custom metadata only when accurately available.
- [x] 6.5 Add pagination, projection, filtering, sorting, and count controls that enable only exact supported operations and never present visible-page operations as whole-file results.
- [x] 6.6 Add bounded CSV and JSON export for the current page or selected rows/columns with explicit partial-export labeling.
- [x] 6.7 Enforce read-only behavior by omitting editor and save controls for every analytical data source regardless of storage overwrite capability.
- [x] 6.8 Add initialization, loading, progress, cancel, malformed, unsupported, authorization, limit, network, and internal error states with safe fallback actions.
- [x] 6.9 Verify keyboard navigation, focus, screen-reader labeling, constrained layouts, horizontal overflow, and all four Cagnard themes.

## 7. Parquet with DuckDB-Wasm

- [x] 7.1 Add pinned DuckDB-Wasm dependencies and package its worker, WASM, and required Parquet assets locally as lazy production artifacts.
- [x] 7.2 Implement the authenticated Parquet content-access path selected by the spike without exposing provider credentials or unrestricted object URLs.
- [x] 7.3 Initialize and close DuckDB connections in the worker with external extension loading and unapproved remote access disabled.
- [x] 7.4 Implement Parquet schema, logical type, key-value metadata, row-group, compression, and column-statistics inspection.
- [x] 7.5 Implement bounded projected row pages and opaque continuation state through generated, validated DuckDB queries.
- [x] 7.6 Implement validated column filters and sorting with configured cost and result limits and no arbitrary SQL surface.
- [x] 7.7 Add cancellation, timeout, range-unavailable, encrypted or unsupported Parquet, malformed file, and worker crash handling.
- [x] 7.8 Test that opening and querying large Parquet fixtures uses partial requests for filesystem and S3 and does not add DuckDB to the initial application bundle.

## 8. Avro OCF

- [x] 8.1 Implement Avro OCF header, writer schema, codec, sync marker, and custom metadata inspection in a worker.
- [x] 8.2 Implement block-aware bounded record decoding with opaque block-offset and record-position cursors.
- [x] 8.3 Convert Avro records, unions, enums, fixed, bytes, logical types, arrays, maps, and nested records into normalized schema and row values without losing type information.
- [x] 8.4 Implement the selected codec matrix and explicit unsupported-codec, malformed block, truncation, cancellation, and limit errors.
- [x] 8.5 Add fixture-driven tests for multiple blocks, supported codecs, nested schemas, schema edge cases, continuation without duplicate records, and malformed containers.

## 9. Arrow IPC and Feather

- [x] 9.1 Add the pinned Apache Arrow JavaScript dependency behind the structured-data worker boundary.
- [x] 9.2 Implement Arrow IPC file and Feather schema, record-batch metadata, and bounded row inspection.
- [x] 9.3 Implement incremental Arrow IPC stream batch consumption without exposing partial batches as complete rows.
- [x] 9.4 Enforce the buffered format ceiling and preserve safely available metadata when row inspection is refused.
- [x] 9.5 Add fixture-driven tests for nested Arrow types, dictionaries, nulls, multiple batches, file/stream distinction, truncation, cancellation, and size limits.

## 10. NDJSON, CSV, and TSV

- [x] 10.1 Implement incremental UTF-8 NDJSON decoding with byte-offset cursors and partial-line preservation across range boundaries.
- [x] 10.2 Add table and per-record JSON views plus malformed-record reporting with line and byte context.
- [x] 10.3 Replace the existing in-memory CSV table parser with incremental CSV/TSV parsing that preserves quoted multiline and chunk-crossing fields.
- [x] 10.4 Expose detected delimiter, quoting, escaping, and header interpretation with safe supported adjustments and bounded raw fallback.
- [x] 10.5 Add tests for multibyte UTF-8 boundaries, CRLF, blank lines, malformed NDJSON, quoted delimiters, multiline fields, missing columns, dialect ambiguity, pagination, and cancellation.

## 11. Documentation and Migration

- [x] 11.1 Replace UI-plugin architecture and configuration documentation with first-party opener and structured-data architecture documentation.
- [x] 11.2 Add a migration guide showing removal of `uiPlugins`, the removed API endpoint, and the first-party replacement behavior.
- [x] 11.3 Document supported formats, MIME and extension matching, Avro codecs, per-format capabilities, read-only behavior, export scope, browser limits, and fallback actions.
- [x] 11.4 Update getting-started and example documentation to identify the generated data fixtures and explain how to open them on filesystem and MinIO.
- [x] 11.5 Update contributor guidance for adding a first-party format handler, worker assets, fixtures, tests, licenses, and documentation without presenting the registry as a public plugin API.
- [x] 11.6 Update documentation traceability and remove or replace compatibility pages that describe the retired UI-plugin system.

## 12. End-to-End Validation

- [x] 12.1 Run Go tests, frontend unit tests, type checking, production build, dependency and license checks, and documentation validation.
- [x] 12.2 Validate canonical and example HOCON, all Docker Compose examples, Helm lint, and every Helm example render after removing `uiPlugins`.
- [x] 12.3 Run browser integration coverage for each supported format on Unix filesystem and MinIO/S3, including pagination, cancellation, errors, and bounded export.
- [x] 12.4 Verify network traces show range access where required, no raw credentials, no unexpected external worker or extension fetches, and no UI-plugin endpoint request.
- [x] 12.5 Capture and inspect desktop, constrained, and mobile screenshots in Classic light/dark and Solar light/dark with no overlap, clipping, or unreadable data cells.
- [x] 12.6 Run strict OpenSpec validation, documentation link validation, secret scanning, asset checks, and `git diff --check`, then mark every verified task complete.

## 13. UI Refinement and Interaction Consistency

- [x] 13.1 Replace the overflowing structured-data command strip with a responsive toolbar that keeps rows, columns, filter, sort, and bounded export actions reachable without horizontal control scrolling.
- [x] 13.2 Replace the clipped native Columns details menu with an accessible, dismissible popover that supports column search, select all, clear, and explicit projection application above the data grid.
- [x] 13.3 Build integrated multi-filter and ordered multi-sort editors with type-appropriate values, explicit applied state, conjunctive filter rows, ordered sort keys, active-query counts, reset behavior, and correct `is null` handling.
- [x] 13.4 Add exact Parquet sorting from sortable table headers and ensure toolbar and header sorting share one applied query state without implicit default sorting.
- [x] 13.5 Constrain the structured viewer to the opener viewport so the data grid scrolls independently while its tabs, controls, and pagination remain reachable.
- [x] 13.6 Normalize hover, expanded, active, disabled, and focus feedback across shared icon, primary, provider, grouped action, tab, pagination, modal, pasteboard, and transfer controls in every theme.
- [x] 13.7 Close grouped action menus before primary actions open dialogs or other surfaces and preserve outside-click and Escape dismissal.
- [x] 13.8 Run frontend tests and production build, then inspect desktop, medium, and mobile browser screenshots in Classic light/dark and Solar light/dark with no clipped controls, hidden popovers, or inaccessible pagination.
- [x] 13.9 Keep asynchronous filter, sort, and projection feedback inside the initiating Apply control, replace its spinner with a Stop affordance on hover, and avoid toolbar or header layout shifts.
- [x] 13.10 Represent applied filter and sort state through compact count badges without leaving closed triggers in their expanded hover style.
- [x] 13.11 Extend exact reader queries to ordered sort arrays and support conventional column-header replacement plus Shift-click additive sorting with visible priority.
