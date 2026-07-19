## Why

Cagnard's first-party structured-data viewer is useful but exposes materially different query capabilities for Parquet, Avro, CSV, NDJSON, and Arrow files even when DuckDB can provide the same exact operations. Users also cannot inspect detected Iceberg tables or multidimensional NetCDF datasets through the same coherent analytical workflow.

## What Changes

- Route supported relational formats through a shared DuckDB-backed relation when practical so columns, exact filters, ordered multi-column sorts, pagination, bounded exports, and query behavior are consistent across Parquet, Avro, CSV/TSV, NDJSON, and Arrow/Feather.
- Add a read-only SQL workspace that queries only the opened source's controlled `data` relation, supports analytical `SELECT` and CTE queries, pages bounded results, and provides cancellation and actionable errors without exposing arbitrary storage access, mutation, extension loading, or provider credentials.
- Detect credible Iceberg table roots while preserving ordinary folder browsing as the default, and offer an explicit **Open as Iceberg table** action with table data, schema, metadata, snapshots, and SQL inspection through DuckDB-Wasm.
- Add first-party NetCDF inspection for classic and NetCDF-4 families through a NetCDF-aware reader, including groups, dimensions, variables, attributes, CF-aware decoded values, bounded multidimensional slicing, line/heatmap/table views, and relational projection of selected slices into DuckDB.
- Make NetCDF SQL semantics explicit: `data` represents the selected bounded slice and compatible selected variables, never an implied flattening of the complete multidimensional dataset.
- Preserve read-only operation, configurable browser memory and row ceilings, authenticated range access where supported, truthful degraded states, cancellation, and deterministic cleanup for every source.
- Add representative generated fixtures and compatibility tests for relational formats, Iceberg metadata layouts, NetCDF variants, CF conventions, malformed inputs, compression, range access, and large-file limits.
- Update user and developer documentation with the common structured explorer, SQL safety model, Iceberg detection/opening workflow, NetCDF slicing model, supported format matrix, limits, and fallbacks.
- Keep all new controls visually integrated with Cagnard's existing tabs, popovers, badges, buttons, focus states, responsive layouts, and light/dark themes; loading and cancellation feedback must retain stable dimensions and avoid overlay, overflow, and layering regressions.

## Capabilities

### New Capabilities

- `iceberg-table-inspection`: Detection and explicit read-only opening of Iceberg table folders, including snapshots and DuckDB-backed data and SQL inspection.
- `scientific-array-inspection`: NetCDF format recognition, semantic metadata, bounded multidimensional slicing and visualization, CF-aware decoding, and controlled relational projection.

### Modified Capabilities

- `structured-data-file-inspection`: Unify exact relational operations through DuckDB where supported and add the controlled read-only SQL workspace shared by files, Iceberg tables, and bounded NetCDF projections.
- `file-openers-and-editors`: Route NetCDF files and detected Iceberg folders to first-party analytical openers without changing the default file-browser behavior.
- `file-type-catalog`: Recognize NetCDF variants and the content signals used to identify candidate Iceberg table roots accurately.

## Impact

- Frontend structured-data contracts, worker protocol, DuckDB-Wasm runtime, query state, result paging, exports, opener registry, folder actions, and responsive viewer UI.
- New or evaluated browser dependencies for NetCDF classic and NetCDF-4/HDF5 semantic reading and scientific visualization; DuckDB-Wasm Iceberg compatibility must be verified before version changes are accepted.
- Existing authenticated content and byte-range endpoints may need narrowly scoped random-access behavior for NetCDF/HDF5 readers, without exposing provider credentials or arbitrary URLs.
- Generated filesystem and S3 fixtures, unit tests, worker tests, browser tests, theme and viewport screenshots, documentation, and supported-format matrices.
- No storage-provider contract break and no change to ordinary folder navigation; analytical opening remains explicit and read-only.
