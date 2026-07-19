# structured-data-file-inspection Specification

## Purpose
TBD - created by archiving change add-first-party-data-format-viewers. Update Purpose after archive.
## Requirements
### Requirement: Shared structured-data inspection
Cagnard SHALL provide a first-party, read-only inspection surface for supported structured-data files with Data, Schema, and Metadata views.

#### Scenario: Open supported structured data
- **WHEN** a user opens a supported Parquet, Avro OCF, Arrow IPC, Feather, NDJSON, CSV, or TSV file
- **THEN** Cagnard SHALL open the file in the shared structured-data inspection surface without requiring a configured UI plugin

#### Scenario: Inspect data rows
- **WHEN** the Data view is active
- **THEN** Cagnard SHALL show a bounded page of records with stable column headers and format-appropriate scalar and nested-value rendering

#### Scenario: Inspect schema
- **WHEN** the Schema view is active
- **THEN** Cagnard SHALL show available field names, physical or logical types, nullability, and nested children without flattening away type information

#### Scenario: Inspect format metadata
- **WHEN** the Metadata view is active
- **THEN** Cagnard SHALL show format, container, compression, batch or block, and statistics metadata that the active reader can determine accurately

### Requirement: Truthful data-operation capabilities
Each structured-data source SHALL report whether pagination, projection, filtering, sorting, total counts, and export are supported, unsupported, degraded, or limited before the UI enables those operations.

#### Scenario: Exact operation supported
- **WHEN** a format reader can apply a requested filter, sort, projection, or count to the complete file accurately
- **THEN** Cagnard SHALL enable the operation and identify its result as exact

#### Scenario: Whole-file operation unsupported
- **WHEN** a sequential reader cannot apply filtering or sorting to the complete file within configured limits
- **THEN** Cagnard SHALL disable or identify that operation as unsupported instead of applying it only to the visible page

#### Scenario: Unknown total count
- **WHEN** determining the complete record count would require an unbounded scan
- **THEN** Cagnard SHALL report the total as unknown until it is safely discovered rather than estimating from loaded records

### Requirement: Responsive structured-data controls
Cagnard SHALL keep structured-data navigation and exact query controls reachable in a bounded opener layout at supported desktop, medium, and mobile widths.

#### Scenario: Constrained viewer width
- **WHEN** the structured-data viewer is narrower than its complete set of commands or columns
- **THEN** Cagnard SHALL wrap or group commands without hiding query actions and SHALL confine horizontal scrolling to the data grid where practical

#### Scenario: Choose visible columns
- **WHEN** the user opens the Columns control
- **THEN** Cagnard SHALL show an accessible selector above the grid that remains interactive, can be dismissed by outside click or Escape, and applies the selected projection explicitly

#### Scenario: Configure an exact filter
- **WHEN** exact whole-file filtering is supported
- **THEN** Cagnard SHALL expose up to the reader's supported filter limit as type-appropriate condition rows combined with AND semantics and SHALL accept value-free operators such as `is null`

#### Scenario: Review applied query state
- **WHEN** one or more filters or a sort are applied and their editor is closed
- **THEN** Cagnard SHALL report the applied count in a compact themed badge without retaining the trigger's hover or expanded styling

#### Scenario: Apply or cancel a query
- **WHEN** a filter, sort, or projection Apply action is running
- **THEN** Cagnard SHALL show progress inside that Apply control without moving adjacent content and SHALL expose a Stop action from the running control on pointer hover and by accessible name

#### Scenario: Configure an exact sort
- **WHEN** exact whole-file sorting is supported
- **THEN** Cagnard SHALL expose ordered column and direction keys through integrated controls and sortable column headers without silently activating an unrelated default sort

#### Scenario: Add sorting from a column header
- **WHEN** a user clicks a sortable column header
- **THEN** Cagnard SHALL replace the applied sort with that column, or add and toggle it in priority order when the user Shift-clicks, and SHALL show each applied key's priority and direction

#### Scenario: Browse a result page
- **WHEN** a result contains more rows or columns than fit in the opener viewport
- **THEN** the data grid SHALL scroll independently while the viewer tabs, command surface, and page navigation remain reachable

### Requirement: Bounded and cancellable processing
Cagnard SHALL perform structured-data decoding and query work outside the React main thread with bounded results, explicit limits, cancellation, and resource cleanup.

#### Scenario: Load a page
- **WHEN** a reader returns data to the browser UI
- **THEN** the result SHALL contain no more than the configured page and payload limits

#### Scenario: Cancel active processing
- **WHEN** the user cancels opening or a structured-data operation
- **THEN** Cagnard SHALL abort associated reads or queries, stop reporting progress, and return the opener to a stable canceled or previous state

#### Scenario: Close structured-data file
- **WHEN** the user closes or replaces an open structured-data file
- **THEN** Cagnard SHALL release reader state, object URLs, query connections, buffers, and idle worker resources associated with that file

#### Scenario: Exceed safe browser limit
- **WHEN** a format operation requires complete buffering beyond its configured safe limit
- **THEN** Cagnard SHALL refuse that operation with an actionable message while preserving metadata and download actions

### Requirement: Parquet inspection
Cagnard SHALL inspect Parquet files through a lazily loaded, locally served DuckDB-Wasm worker using authorized partial content access where supported.

#### Scenario: Open Parquet through range reads
- **WHEN** a user opens a Parquet file on a storage entry with byte-range access
- **THEN** Cagnard SHALL read required Parquet metadata and projected data through authorized range requests without downloading the entire object by default

#### Scenario: Inspect Parquet schema and metadata
- **WHEN** the user selects Schema or Metadata for a Parquet file
- **THEN** Cagnard SHALL expose Parquet schema, logical types, row groups, compression, key-value metadata, and available column statistics accurately

#### Scenario: Query bounded Parquet rows
- **WHEN** the user pages, projects columns, filters, or sorts a Parquet file within configured limits
- **THEN** Cagnard SHALL execute a generated bounded query and return only the requested result page

#### Scenario: Prevent arbitrary query access
- **WHEN** the Parquet viewer constructs a query
- **THEN** Cagnard SHALL validate operations and identifiers and SHALL NOT expose arbitrary SQL, unrestricted remote URLs, or raw storage credentials

#### Scenario: Parquet range access unavailable
- **WHEN** the selected provider or browser cannot deliver authorized byte ranges required by the Parquet engine
- **THEN** Cagnard SHALL use an approved scoped fallback or report the limitation without silently downloading an unbounded file

### Requirement: Avro Object Container File inspection
Cagnard SHALL inspect Avro Object Container Files as block-oriented record data while preserving Avro schema and union semantics.

#### Scenario: Open Avro container
- **WHEN** a user opens a valid Avro Object Container File
- **THEN** Cagnard SHALL show its writer schema, codec, custom metadata, and a bounded page of decoded records

#### Scenario: Continue across Avro blocks
- **WHEN** the user requests the next page of an Avro file
- **THEN** Cagnard SHALL continue from an opaque block and record cursor without restarting from an unrelated position or duplicating records

#### Scenario: Render Avro-specific values
- **WHEN** an Avro record contains unions, enums, fixed values, bytes, nested records, arrays, maps, or logical types
- **THEN** Cagnard SHALL preserve the value's type and render it through a bounded readable representation

#### Scenario: Unsupported Avro codec
- **WHEN** an Avro container uses a codec the bundled reader does not support
- **THEN** Cagnard SHALL identify the codec and report it as unsupported while preserving metadata and download actions

### Requirement: Arrow IPC and Feather inspection
Cagnard SHALL inspect supported Apache Arrow IPC file, Arrow IPC stream, and Feather inputs using their schema and record-batch boundaries.

#### Scenario: Open Arrow IPC file or Feather file
- **WHEN** a user opens a supported Arrow IPC file or Feather file within the reader's access limits
- **THEN** Cagnard SHALL show its Arrow schema, record-batch metadata, and bounded rows

#### Scenario: Open Arrow IPC stream
- **WHEN** a user opens a valid Arrow IPC stream
- **THEN** Cagnard SHALL consume complete record batches incrementally and SHALL NOT expose partial batch data as complete records

#### Scenario: Arrow input requires excessive buffering
- **WHEN** the available Arrow reader requires complete buffering and the object exceeds the configured ceiling
- **THEN** Cagnard SHALL decline row inspection and retain schema or metadata only when those can be obtained safely

### Requirement: Record-oriented NDJSON inspection
Cagnard SHALL treat NDJSON and JSON Lines as sequences of JSON records rather than as a single JSON document.

#### Scenario: Open NDJSON records
- **WHEN** a user opens a `.jsonl`, `.ndjson`, or recognized NDJSON media type
- **THEN** Cagnard SHALL incrementally decode complete lines into bounded record pages and offer table and per-record JSON views

#### Scenario: Preserve chunk boundary
- **WHEN** a JSON record crosses a byte-range or decoded-text chunk boundary
- **THEN** Cagnard SHALL retain the incomplete line and decode it only after the complete record is available

#### Scenario: Report malformed NDJSON record
- **WHEN** an NDJSON line is malformed
- **THEN** Cagnard SHALL report its line and byte context, preserve successfully decoded records according to policy, and SHALL NOT reinterpret the entire file as one JSON document

### Requirement: Large CSV and TSV inspection
Cagnard SHALL migrate CSV and TSV table viewing to the shared structured-data surface with incremental, record-boundary-safe decoding.

#### Scenario: Open delimited records
- **WHEN** a user opens a CSV or TSV file
- **THEN** Cagnard SHALL show bounded record pages, detected or declared delimiter information, and a bounded raw-text fallback

#### Scenario: Quoted field crosses chunk boundary
- **WHEN** a quoted CSV or TSV field contains line breaks or crosses a content chunk boundary
- **THEN** Cagnard SHALL preserve parser state until the complete record is available

#### Scenario: Delimited dialect is ambiguous
- **WHEN** delimiter, quoting, escaping, or header detection is uncertain
- **THEN** Cagnard SHALL expose the detected interpretation and allow safe supported adjustments without silently corrupting displayed rows

### Requirement: Read-only analytical formats and bounded export
Cagnard SHALL treat the structured-data formats introduced by this capability as read-only and SHALL limit export to explicitly bounded displayed or selected data.

#### Scenario: Open analytical file with write access
- **WHEN** the storage entry permits overwrite but the active structured-data reader is read-only
- **THEN** Cagnard SHALL hide or disable direct save and editing controls for that file

#### Scenario: Export displayed data
- **WHEN** the user exports the current page or selected rows and columns
- **THEN** Cagnard SHALL generate bounded CSV or JSON output and clearly identify that the export is partial when it does not contain the complete source file

#### Scenario: Request whole-file conversion
- **WHEN** the user requests an unbounded whole-file conversion that this change does not support
- **THEN** Cagnard SHALL report the operation as unavailable rather than materializing the entire file in browser memory

### Requirement: Structured-data error handling
Cagnard SHALL distinguish initialization, authorization, malformed-format, unsupported-feature, limit, query, network, cancellation, and internal failures for structured-data inspection.

#### Scenario: User-actionable format failure
- **WHEN** a structured-data file is malformed, truncated, encrypted, or uses an unsupported feature
- **THEN** Cagnard SHALL show a concise user-facing explanation with available fallback actions

#### Scenario: Internal reader failure
- **WHEN** a worker or format engine fails unexpectedly
- **THEN** Cagnard SHALL show a stable generic error to the user, release reader resources, and log diagnostic context without exposing credentials or sensitive file content

### Requirement: Shared structured-data runtime lifecycle
Cagnard SHALL lazily reuse one structured-data worker and one DuckDB-Wasm engine per browser tab while isolating resources and operations for each opened structured file.

#### Scenario: Delay runtime creation
- **WHEN** a browser tab has not opened a structured-data file
- **THEN** Cagnard SHALL NOT load the structured-data worker or initialize DuckDB-Wasm

#### Scenario: Initialize DuckDB once
- **WHEN** the same browser tab opens multiple Parquet files sequentially or React development remounts a viewer
- **THEN** Cagnard SHALL initialize at most one healthy DuckDB-Wasm engine and load its approved local Parquet extension once for that runtime

#### Scenario: Reuse outer worker across formats
- **WHEN** the same browser tab opens supported structured formats sequentially
- **THEN** Cagnard SHALL reuse the healthy structured-data worker while creating and releasing only source-specific reader state

#### Scenario: Isolate Parquet sources
- **WHEN** a Parquet file is opened through the shared DuckDB engine
- **THEN** Cagnard SHALL assign it a unique registered filename and connection so closing, canceling, or querying one source does not operate on another source

#### Scenario: Close file-specific resources
- **WHEN** a structured viewer closes or replaces its source
- **THEN** Cagnard SHALL cancel its active operations, close its reader or DuckDB connection, unregister its file, and release buffered source state without terminating a healthy shared runtime

#### Scenario: Shut down session runtime
- **WHEN** the user logs out, the structured worker fails unrecoverably, or the browser page terminates
- **THEN** Cagnard SHALL release all source state and terminate the shared worker and DuckDB engine where the browser lifecycle permits

#### Scenario: Recover from failed initialization
- **WHEN** shared worker or DuckDB initialization fails
- **THEN** Cagnard SHALL discard the rejected runtime instance, show a safe retryable error, and allow a later attempt to create a fresh runtime

#### Scenario: Preserve cancellation isolation
- **WHEN** a user stops a query or closes one source while another source operation exists
- **THEN** Cagnard SHALL cancel only the affected source operation unless the shared runtime itself is unhealthy

#### Scenario: Preserve security constraints
- **WHEN** the shared analytical runtime reads structured files
- **THEN** it SHALL continue to accept only authorized same-origin Cagnard content URLs, keep provider credentials unavailable to the frontend engine, disable arbitrary SQL and extension loading, and enforce existing query and response bounds

### Requirement: Unified relational structured-data operations
Cagnard SHALL expose the same exact projection, filtering, ordered multi-column sorting, pagination, bounded export, and SQL capabilities for supported relational structured-data formats whenever the complete source can be represented safely by the shared DuckDB runtime.

#### Scenario: Open a fully supported relational source
- **WHEN** a user opens a supported Parquet, Avro OCF, CSV, TSV, NDJSON, Arrow IPC, or Feather source that can be represented completely within configured access and ingestion limits
- **THEN** Cagnard SHALL bind that source to a controlled relation and expose the same exact query controls regardless of its original format

#### Scenario: Source cannot be represented completely
- **WHEN** a source requires unsupported decoding or complete ingestion beyond a configured limit
- **THEN** Cagnard SHALL retain its safe reader capabilities and identify complete-file filters, sorts, SQL, or exports as limited or unsupported instead of applying them only to loaded rows

#### Scenario: Preserve source-specific semantics
- **WHEN** a source is bound to the shared relation
- **THEN** Cagnard SHALL preserve accurately representable logical types, nulls, nested values, schema, and format-specific metadata outside the relational result

### Requirement: Controlled read-only SQL workspace
Cagnard SHALL provide a read-only SQL workspace that executes bounded analytical queries against only the active source relation named `data`.

#### Scenario: Run an analytical query
- **WHEN** a user runs one valid `SELECT` or `WITH ... SELECT` statement using only `data`
- **THEN** Cagnard SHALL execute it in the active source connection and return a typed, bounded, paginated result

#### Scenario: Use analytical SQL features
- **WHEN** a query uses supported expressions, filters, aggregation, grouping, ordering, windows, subqueries, set operations, or self-joins over `data`
- **THEN** Cagnard SHALL accept those constructs subject to configured time, row, and payload limits

#### Scenario: Reject unsafe SQL
- **WHEN** SQL contains another relation, a table function, external source, multiple statements, mutation, DDL, attachment, copying, pragma, extension operation, or an unsupported syntax node
- **THEN** Cagnard SHALL reject it before execution with a concise safe explanation

#### Scenario: Enforce runtime defense in depth
- **WHEN** a validated query executes
- **THEN** its connection SHALL disable external access and extension installation, expose no provider credentials, and retain source-specific cancellation and cleanup

#### Scenario: Stop a running query
- **WHEN** a user activates Stop while SQL is running
- **THEN** Cagnard SHALL interrupt only that source operation, retain the last stable result or editor contents, and return the workspace to a stable canceled state

### Requirement: SQL and generated query state remain explicit
Cagnard SHALL distinguish manually authored SQL from the Data view's generated projection, filters, and ordered sorts.

#### Scenario: Open SQL after configuring Data view
- **WHEN** a user opens SQL after applying Data-view operations
- **THEN** Cagnard SHALL preserve the existing SQL text and SHALL NOT silently rewrite or execute it

#### Scenario: Insert current view query
- **WHEN** a user activates Insert current view
- **THEN** Cagnard SHALL generate editable SQL that represents the current projection, filters, and ordered sorts against `data`

#### Scenario: Source relation scope changes
- **WHEN** the active file, Iceberg snapshot, or NetCDF slice changes
- **THEN** Cagnard SHALL invalidate stale result cursors and identify the new `data` scope before another query runs

### Requirement: Integrated SQL interaction surface
The SQL workspace SHALL reuse Cagnard's established structured-viewer visual language and remain operable across supported viewports, themes, pointer input, and keyboard input.

#### Scenario: Edit a SQL query
- **WHEN** the user writes or inserts SQL in the query editor
- **THEN** Cagnard SHALL provide theme-aware SQL syntax coloring while retaining an accessible native editing control, synchronized scrolling, selection, and caret behavior

#### Scenario: Query begins running
- **WHEN** the user activates Run
- **THEN** the Run control SHALL retain stable dimensions, show progress in place, and expose a Stop icon on pointer hover and through an accessible name without shifting adjacent controls

#### Scenario: SQL result exceeds the viewport
- **WHEN** query rows or columns exceed available space
- **THEN** the result grid SHALL own its scrolling while the editor, Run or Stop action, result status, and paging controls remain reachable

#### Scenario: Query fails
- **WHEN** validation or execution fails
- **THEN** Cagnard SHALL show actionable safe feedback inside the SQL workspace without overlaying browser actions or exposing credentials and source content
