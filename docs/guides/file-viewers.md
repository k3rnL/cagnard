# File Viewers

Selecting a row updates metadata without downloading content. Opening a file routes it through Cagnard's typed first-party opener registry. Provider credentials stay in the backend; viewers use authorized Cagnard APIs and same-origin content URLs.

## Included Openers

| Content | Experience |
| --- | --- |
| Text, source, and config | Bounded source view, search, editing when writable |
| Markdown | Rendered and source views |
| JSON and YAML | Structured and raw views with formatting |
| Diff and patch | Added, removed, and hunk highlighting |
| Logs | Level coloring, content search, and follow mode when watch is available |
| Images, audio, video, PDF | Browser-native viewers; media can seek with byte ranges |
| ZIP, TAR, TAR.GZ, TGZ, GZ | Archive listing and nested entry opening |
| Parquet, Avro, CSV, TSV, NDJSON, Arrow IPC, Feather | Unified Data, SQL, Schema, and Metadata views with exact operations when the complete source fits configured limits |
| Iceberg v1/v2 table folders | Explicit read-only table opening, current and historical snapshots, exact queries, and SQL |
| NetCDF classic and NetCDF-4 | Semantic groups, dimensions, variables, CF-aware bounded slices, plots, tables, and current-slice SQL |

RAR, 7z, ORC, Delta Lake, Hudi, SQLite, generic HDF5, OPeNDAP, and Zarr currently show metadata only.

## Structured Data Controls

Analytical sources share one surface. **Data** provides local grid overflow, bounded pages, column visibility, nested-value expansion, null/binary rendering, row selection, and bounded CSV/JSON export. **SQL** runs controlled read-only queries over the documented `data` scope. **Schema** and **Metadata** preserve format-specific facts without changing the common controls. Iceberg adds **Snapshots**; NetCDF adds variable and slice controls before it exposes a current-slice relation.

**Columns** supports search and explicit apply. **Filter** combines up to eight field-aware conditions. **Sort** accepts up to eight unique ordered keys; a normal header click replaces the order and Shift-click adds or toggles one. Applied counts appear in badges. Apply/Run controls keep stable dimensions and become Stop actions while work is active.

All analytical viewers are read-only. CSV and JSON exports contain the current page or selected rows and visible columns. See [Explore structured data](structured-data.md) for SQL scope, Iceberg, NetCDF, limits, and fallbacks.

## Runtime And Fallbacks

The analytical worker and DuckDB-Wasm runtime are lazy and shared only within the browser tab. Each opened source owns its connection, registration, cancellation, and cleanup. Closing a source releases those resources; logout, page teardown, or a fatal runtime failure terminates the complete worker runtime.

Parquet and Iceberg use authenticated same-origin range reads. The selected NetCDF adapter and bounded relational ingestion use complete buffers with explicit byte and row ceilings. Errors distinguish authorization, network, malformed/truncated input, unsupported codecs or semantics, configured limits, cancellation, and internal failure. Original download remains available when a viewer cannot open content safely.

## Avro Codecs

Avro OCF supports `null`, raw `deflate`, and `snappy` blocks. Other codecs show an explicit unsupported-codec error and leave download available.

## Large Text And Media

Text-like files use bounded preview pages and **Load more**. In-file search supports case sensitivity and regular expressions with continuable backend results. Media elements request byte ranges directly from filesystem and S3 providers so playback can seek.

## Log Follow

Follow mode subscribes to a per-file Server-Sent Events stream. Filesystem providers use native notifications; S3 uses degraded backend polling. Replacement, truncation, rotation, or removal resets or stops the view rather than joining discontinuous content.

See [first-party opener architecture](../architecture/file-openers.md), [structured-data runtime and limits](../architecture/structured-data-limits.md), [migration from `uiPlugins`](migrating-ui-plugins.md), and [adding an opener](../contributing/file-openers.md).
