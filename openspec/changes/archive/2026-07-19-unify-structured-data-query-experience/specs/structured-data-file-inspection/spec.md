## ADDED Requirements

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
