## ADDED Requirements

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

