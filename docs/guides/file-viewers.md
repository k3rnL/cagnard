# File Viewers

Selecting a row updates metadata without downloading content. Opening a file routes it through Cagnard's typed first-party opener registry. Provider credentials stay in the backend; viewers use authorized Cagnard APIs and content URLs.

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
| Parquet | Lazy DuckDB-Wasm Data, Schema, and Metadata views with range access |
| Avro OCF | Data, writer schema, codec, block, and custom metadata views |
| Arrow IPC and Feather | Data, nested schema, batch, and container views |
| NDJSON / JSON Lines | Record-safe byte pagination and malformed-record context |
| CSV and TSV | Quoted multiline-safe byte pagination and dialect metadata |

RAR, 7z, ORC, Iceberg, Delta Lake, Hudi, SQLite, HDF5, and NetCDF currently show metadata only.

## Structured Data Controls

Analytical files open in one shared surface:

- **Data** provides a horizontally scrollable grid, bounded pages, column visibility, nested-value expansion, null/binary rendering, row selection, and page-scoped CSV/JSON export.
- **Schema** shows nested physical/logical types, nullability, and format metadata.
- **Metadata** shows only facts the reader can obtain accurately, such as codec, blocks, batches, row groups, statistics, and custom key/value data.

The Data toolbar keeps page size, column selection, exact query controls, and current-page export outside the scrolling grid. **Columns** supports search and explicit apply. When the reader supports exact whole-file operations, **Filter** accepts up to eight field-aware conditions combined with AND semantics. **Sort** accepts up to eight unique, ordered sort keys and shares the applied order with sortable column headers: a normal header click replaces the order, while Shift-click adds or toggles a key. Applied counts appear on the closed controls, and sorted headers show direction and priority. An active Apply button shows its own progress and becomes a Stop action on hover, so loading never inserts a shifting status row. On constrained screens these controls stack while the grid keeps its own horizontal and vertical scrolling.

Exact global filtering, sorting, projection, and counts are enabled for Parquet and buffered Arrow sources. Avro reports an exact count from block headers but does not scan every record for global filtering or sorting. Sequential NDJSON, CSV, and TSV readers deliberately disable global operations instead of applying them only to visible rows.

All analytical viewers are read-only, even on writable roots. **Page CSV** and **Page JSON** export only the current page or selected rows and visible columns.

The analytical worker is lazy and shared only within the current browser tab. DuckDB-Wasm initializes on the first Parquet open and is reused for later Parquet files; each file still has a unique virtual registration and connection. Closing a viewer releases its source state, while logout or closing the page releases the complete runtime.

## Limits And Fallbacks

| Reader | Access model | Current ceiling |
| --- | --- | --- |
| Parquet | DuckDB-Wasm HTTP byte ranges; full HTTP fallback disabled | Bounded query pages of at most 500 rows and 16 MB worker responses |
| Avro OCF | Complete browser buffer, then block decoding | 128 MB file, 500-row pages |
| Arrow IPC / Feather | Complete browser buffer | 64 MB file, 500-row pages |
| NDJSON | 256 KiB range chunks and byte cursors | 8 MB per record, 500-row pages |
| CSV / TSV | 256 KiB range chunks and record-boundary cursors | 8 MB per record, 500-row pages |

Errors distinguish authorization, network, malformed/truncated input, unsupported codecs, unavailable byte ranges, browser limits, cancellation, and internal failures. The error surface keeps a direct download action so unsupported content is never trapped in the viewer.

## Avro Codecs

Avro OCF supports `null`, raw `deflate`, and `snappy` blocks. Other codecs show an explicit unsupported-codec error and leave download available.

## Large Text And Media

Text-like files use bounded preview pages and **Load more**. In-file search supports case sensitivity and regular expressions with continuable backend results. Media elements request byte ranges directly from filesystem and S3 providers so playback can seek.

## Log Follow

Follow mode subscribes to a per-file Server-Sent Events stream. Filesystem providers use native notifications; S3 uses degraded backend polling. Replacement, truncation, rotation, or removal resets or stops the view rather than joining discontinuous content.

See [first-party opener architecture](../architecture/file-openers.md), [structured-data runtime and limits](../architecture/structured-data-limits.md), [migration from `uiPlugins`](migrating-ui-plugins.md), and [adding an opener](../contributing/file-openers.md).
