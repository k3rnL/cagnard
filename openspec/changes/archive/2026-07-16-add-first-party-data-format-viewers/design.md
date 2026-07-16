## Context

Cagnard currently combines hard-coded React opener views with backend-supplied `uiPlugins` manifests. A manifest can select an existing view and alter matching metadata, but it cannot provide executable rendering or parsing behavior. First-party openers are represented through the same manifest shape, so adding a real format still requires frontend code while configuration, API, examples, and documentation imply an extensibility model that does not exist.

The browser already receives normalized storage metadata and can access authorized file content through bounded reads, streams, and HTTP byte ranges backed by both filesystem and S3 providers. The frontend already classifies Parquet, Avro, and ORC extensions, but the backend catalog does not classify them consistently and no data-category opener exists. JSON Lines is classified as JSON and can consequently be routed to a whole-document parser.

Analytical files can be much larger than browser memory. Parquet is seekable and columnar, Avro OCF is block-oriented and sequential, Arrow IPC has file and stream variants, and CSV/NDJSON require record-boundary handling. A common UI therefore cannot assume that every format supports the same pagination, filtering, sorting, or metadata operations.

## Goals / Non-Goals

**Goals:**

- Replace frontend plugin manifests with a typed, compile-time first-party opener registry.
- Provide one accessible data inspection surface with Data, Schema, and Metadata tabs and truthful per-format controls.
- Inspect Parquet through lazily loaded DuckDB-Wasm without loading the complete file when range access is available.
- Inspect Avro OCF, Arrow IPC/Feather, NDJSON, CSV, and TSV with bounded memory and explicit format limitations.
- Keep parsing work off the React main thread and make opening, paging, and query work cancellable.
- Preserve backend authorization and provider abstraction; no storage credentials cross into the browser.
- Remove the obsolete UI plugin API and configuration contract with an actionable migration diagnostic.

**Non-Goals:**

- Iceberg, Delta Lake, Hudi, Zarr, or other multi-file dataset discovery and snapshot semantics.
- ORC, SQLite, DuckDB database files, HDF5, NetCDF, Protobuf, or MessagePack viewers.
- Editing, rewriting, appending, or preserving binary analytical formats.
- Arbitrary user-authored SQL in the first release.
- Executable third-party frontend extensions or a replacement plugin distribution model.
- Cross-file query planning or joining multiple selected objects.

## Decisions

### 1. Replace UI plugins with a first-party opener registry

The frontend SHALL keep a deterministic registry, but registry entries will be typed source code that reference lazy component and data-source loaders. The registry will no longer consume backend manifests.

Each entry will declare matching rules, content requirements, size constraints, supported view modes, edit/save behavior, and a lazy loader. Existing text, media, PDF, archive, and structured-text openers will migrate to this registry without changing their user-visible behavior.

The implementation should move misleading `plugins` modules to `openers`, `formats`, or similarly first-party names. Storage provider plugins remain separate and unchanged.

**Alternatives considered:** Retaining manifests as operator overrides preserves apparent flexibility but continues an API with no executable extension mechanism. Replacing the registry with a single component switch removes useful separation and lazy-loading boundaries.

### 2. Normalize analytical readers behind a data-source contract

The shared data viewer will consume a first-party `StructuredDataSource` contract rather than format-specific React state. The contract will expose:

- schema fields with nested children, logical types, and nullability;
- format and container metadata;
- a page of rows plus an opaque continuation cursor;
- declared support for exact filtering, sorting, projection, total counts, and export;
- cancellation and cleanup;
- structured, user-facing format errors.

The viewer will enable controls only when the active source reports that they are exact and supported. It will not present page-local sorting or filtering as a whole-file operation. Nested lists, maps, structs, unions, binary values, timestamps, decimals, and nulls will use bounded cell renderers with expandable details.

### 3. Run format engines in dedicated Web Workers

Parquet, Avro, Arrow, and streaming text parsing will run outside the React main thread. A worker request protocol will use request IDs, explicit cancellation, bounded pages, and transferable buffers where useful. Closing or replacing an opener will abort outstanding fetches, close data-source state, release DuckDB connections, and terminate idle workers.

The UI will show separate initialization, metadata-reading, query, canceled, unsupported-codec, malformed-file, and authorization failures rather than a generic open error.

### 4. Use locally served DuckDB-Wasm for Parquet

DuckDB-Wasm, its worker, core WASM binary, and required Parquet support will be version-pinned and served by the Cagnard frontend. They will be loaded only after opening a Parquet file. The default single-threaded bundle avoids requiring cross-origin isolation headers; a threaded bundle is outside this change.

The Parquet source will register only the authorized same-origin Cagnard content URL. Cagnard's content endpoint will continue to authenticate the request and translate HTTP `Range` into provider `RangeRead`. The worker will issue generated, parameterized queries for schema, metadata, projected pages, filters, and sorting. Column identifiers and filter operations will be validated and quoted; arbitrary SQL, extension installation, remote URL input, and external extension autoloading will not be exposed.

The implementation spike confirmed that DuckDB-Wasm sends the signed session cookie on same-origin `HEAD` and `GET` requests and performs partial `206` reads through the existing endpoint for both filesystem and S3 roots. Cagnard therefore uses the existing stateless `/api/storage/content` URL with an object-version cache key. No scoped content-handle fallback or server-side Parquet reader is required. Browser traces also confirmed that workers, WASM, and the signed Parquet extension remain same-origin and that neither provider credentials nor unrestricted object URLs enter the frontend.

DuckDB query results will be capped and returned as Arrow batches. The UI will never materialize an unbounded query result. Large offsets or expensive global sorts may be rejected or require explicit confirmation according to configured limits.

### 5. Treat each non-Parquet format according to its physical layout

Avro OCF will expose writer schema, codec, custom metadata, block counts discovered so far, and records. Its cursor will identify a block byte offset and record position. The worker may maintain a transient block index while the file remains open. Supported codecs will be documented and tested; unsupported codecs will produce a specific error without blocking download.

Arrow IPC file and Feather inputs will expose schema, record batches, and rows through Apache Arrow JavaScript. Arrow IPC stream inputs will be consumed batch by batch. When a library path requires complete buffering, the opener will enforce a configured size ceiling instead of pretending to be large-file safe.

NDJSON will use incremental UTF-8 decoding across byte ranges, preserve partial lines between chunks, and report malformed records with line and byte context. Ordinary `.json` remains a whole-document JSON opener.

CSV and TSV will use incremental decoding and record-boundary-safe parsing. Dialect detection results and limitations will be displayed. Global filtering or sorting will be disabled unless an engine can execute it exactly; the existing raw text fallback remains available within bounded text limits.

### 6. Make analytical inspection read-only

Binary and record-oriented analytical openers will not advertise overwrite or edit controls. Export is limited to the current bounded result or explicitly selected rows and columns, with CSV and JSON output generated locally. The UI will label partial exports and will not imply that the original file was converted in full.

### 7. Remove the backend UI plugin contract explicitly

The backend will remove `UIPluginConfig`, manifest API models, `GET /api/plugins/ui`, and decoding into runtime configuration. The frontend will remove its plugin fetch, types, state, and archive-view dependency on configured manifests.

Because silently ignoring an old `uiPlugins` section would hide a breaking change, configuration validation will detect that legacy top-level key and fail startup with a migration message. Canonical configuration, Helm values, and every runnable example will remove the section.

### 8. Keep backend and frontend classification aligned

Both catalogs will recognize Parquet, Avro OCF, Arrow IPC/Feather, NDJSON, CSV, and TSV by practical MIME aliases and extensions. Extension fallback remains necessary because object stores commonly report `application/octet-stream`. Classification will distinguish JSON documents from line-delimited JSON and assign a dedicated analytical-data category and table-oriented icon where appropriate.

### 9. Test with generated, safe format fixtures

Repository fixtures will be generated from deterministic source data and include nested values, nulls, logical types, multiple blocks or batches, multiple compression modes where supported, malformed samples, and files large enough to exercise range and cancellation behavior. The same fixture set will be available in relevant filesystem and MinIO examples without embedding private data.

Unit tests will cover registry matching, classification, worker protocol, schema conversion, nested rendering, pagination cursors, cancellation, limits, and errors. Browser integration tests will verify real filesystem and S3 range behavior, lazy loading, responsive layouts, all themes, and no UI-plugin API request. Build validation will verify that worker/WASM assets are packaged locally.

### 10. Treat explorer commands as a bounded responsive tool surface

The structured-data viewer will keep its tabs, primary controls, and pagination inside the opener viewport while the data grid owns the row and column scrolling. The command surface will wrap into stable groups instead of requiring horizontal toolbar scrolling. Columns will use an accessible dismissible popover above the grid; filter and sort configuration will use an integrated responsive editor below the primary command row.

Filter and sort intent will be explicit. Opening or applying another query control will not silently activate a default sort, and operators that do not require a value, such as `is null`, will remain valid. Parquet table headers will expose the same exact sort state as the toolbar so a user can use the standard column-header workflow without creating a separate page-local result.

Exact filtering will expose up to the reader's existing eight-condition safety limit as editable rows combined with AND semantics. Each row owns its column, type-aware operator, and optional value, while the closed trigger reports only the applied condition count. Filter and sort triggers retain hover or expanded emphasis only while hovered or open; an applied query does not leave the complete trigger filled.

Exact sorting will use an ordered array of up to eight unique column keys. The editor exposes one column and direction per priority, while table headers use the familiar single-click replacement behavior and Shift-click to add or toggle an additional key. Applied headers show their priority and direction from the same query state used by the editor and worker request.

Query and projection progress will not insert a new status row into the opener. The initiating Apply button keeps its dimensions, shows an in-place spinner while its operation is active, and swaps that spinner for a Stop icon on hover so cancellation remains available without moving the table header or command surface.

Shared control primitives will use the active theme's accent border and soft accent background for hover or expanded feedback, following the appearance selector. Filled primary and destructive controls retain their semantic colors. Row surfaces and table headers remain purpose-specific, but buttons inside them still expose clear focus and active state. Grouped action menus will close before their primary action opens a modal or another interaction surface.

## Risks / Trade-offs

- **DuckDB-Wasm cannot attach the authenticated session to range requests** -> Prove this before the main implementation; use a short-lived stateless scoped content handle if needed.
- **WASM and worker assets materially increase release size** -> Lazy-load separate immutable assets and verify that the initial browser bundle does not include DuckDB.
- **Browser memory limits vary, especially on mobile** -> Cap result batches and buffered formats, stream or range-read where possible, and fail early with actionable limits.
- **Parquet queries can still be expensive despite projection and range reads** -> Generate bounded queries, expose cancellation, limit sorting/filter complexity, and avoid arbitrary SQL.
- **Avro codec support differs across JavaScript libraries** -> Define and test an explicit codec matrix and report unsupported codecs accurately.
- **Arrow file and stream access have different seek behavior** -> Declare format-specific limits and avoid claiming range pagination when complete buffering is required.
- **Sequential formats cannot provide cheap exact global sorting** -> Disable unsupported controls and report capability accuracy instead of sorting only the visible page.
- **Removing `uiPlugins` breaks existing configuration** -> Fail with a precise migration message and publish a migration section showing removal of the obsolete block.
- **First-party registry may later need real extension points** -> Keep handler contracts modular and scoped, but do not expose them as a compatibility API until executable isolation, versioning, and distribution are designed.

## Migration Plan

1. Add worker infrastructure, the structured-data contract, generated fixtures, and the DuckDB-Wasm range spike behind first-party code paths.
2. Convert existing openers to the first-party registry while temporarily preserving behavior and tests.
3. Add the shared viewer and each format source incrementally, with Parquet gated on the range spike.
4. Remove frontend plugin fetching and backend manifest delivery in the same commit boundary so mixed contracts cannot be released.
5. Add legacy `uiPlugins` validation, remove the key from examples and Helm values, and update migration documentation.
6. Run backend, frontend, Compose, Helm, documentation, browser, filesystem, and MinIO validation before release.

Rollback requires restoring both the frontend plugin fetch and backend endpoint/config model together. Analytical viewers are additive and can be disabled individually by removing their first-party registry entries if a format-specific regression is found.

## Resolved Questions

- Avro uses `avsc` for schema and datum decoding, `fflate` for raw Deflate blocks, and `snappyjs` for Snappy blocks. The supported codec matrix is `null`, `deflate`, and `snappy`.
- DuckDB-Wasm works with the existing cookie-authenticated content endpoint for filesystem and S3 byte-range access; the scoped-handle fallback remains unnecessary.
- The viewer defaults to 50 rows, caps pages at 500 rows and worker responses at 16 MB, buffers Arrow IPC file/Feather inputs up to 64 MB, and bounds Arrow IPC streams at 128 MB.
