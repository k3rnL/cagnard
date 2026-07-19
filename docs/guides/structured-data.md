# Explore Structured Data

Cagnard opens relational data files, Iceberg table folders, and NetCDF scientific datasets in one read-only analytical workspace. Processing stays in the browser worker, provider credentials stay in the backend, and every operation is bounded by server configuration.

## Relational Files

Open Parquet, Avro OCF, CSV, TSV, NDJSON, Arrow IPC, or Feather as a normal file. When the complete source fits the configured ingestion limits, every format provides the same exact operations:

- choose visible columns;
- combine multiple filters with AND semantics;
- apply ordered, multi-column sorts;
- move through exact result pages;
- export the current page or selected rows as CSV or JSON;
- run controlled read-only SQL against `data`.

Parquet is queried lazily through DuckDB byte ranges. Other formats are decoded or buffered into a bounded source-owned relation. If a file is too large, malformed, or uses an unsupported codec, Cagnard keeps the safe format-specific view or offers the original download without pretending that page-local operations cover the whole file.

## SQL Workspace

The **SQL** tab exposes exactly one relation named `data`. Its scope is shown above the editor:

| Source | Meaning of `data` |
| --- | --- |
| Relational file | The complete file accepted within configured ingestion limits |
| Iceberg table | The selected current or historical snapshot |
| NetCDF | The explicitly loaded bounded slice and compatible selected variables |

The theme-aware editor colors SQL syntax while preserving native text selection, keyboard editing, and scrolling. It accepts one `SELECT` or `WITH ... SELECT` statement. Expressions, aggregates, windows, subqueries, set operations, and self-joins over `data` are supported. Mutation, DDL, `COPY`, `ATTACH`, `PRAGMA`, extension commands, table functions, additional relations, external URLs, and multiple statements are rejected before DuckDB runs them.

Use **Insert current view** to create editable SQL from the current columns, filters, and ordered sorts. It replaces the editor text but does not run the query. **Run** keeps its dimensions while working and becomes **Stop** when the pointer is over it. Results are paged and capped by the configured SQL row, time, and worker-payload limits.

## Iceberg Tables

Cagnard keeps folders as folders. Navigate into a credible Iceberg table folder normally; a lazy probe then reveals **Open as Iceberg table** as the first toolbar action. Normal single-click navigation never changes.

The first release supports path-based, read-only Iceberg format v1 and v2 tables whose metadata, manifests, and data remain inside the selected authorized table root. Opening a table provides:

- Data, SQL, Schema, Metadata, and Snapshots views;
- current-snapshot rows by default;
- snapshot identifiers, ancestry, commit times, operations, and summaries;
- deliberate historical-snapshot selection that rebinds `data` and invalidates stale pages and SQL cursors.

External catalogs, foreign buckets, credentialed URLs, escaping references, unsupported delete semantics, and incompatible metadata remain ordinary browsable folders with a safe unsupported explanation.

## NetCDF Datasets

Cagnard recognizes NetCDF classic CDF-1, 64-bit offset CDF-2, 64-bit data CDF-5, and validated NetCDF-4 containers. Generic HDF5 files are not treated as NetCDF unless NetCDF semantic markers are present.

The Data view starts with a searchable variable catalog. Choose one or more variables that use identical dimensions, then configure:

- decoded or raw stored values;
- X and Y display dimensions;
- an explicit start and count for every active dimension;
- coordinate-aware defaults when valid CF metadata identifies time, vertical, latitude, or longitude axes.

Scalars use a value view, one-dimensional slices use an accessible line plot, two-dimensional slices use a heatmap, and larger or non-display ranges fall back to a table. Every plot has textual labels and tabular data. Missing and fill values become null in decoded mode; `scale_factor` and `add_offset` are applied after missing-value detection.

Loading a slice creates a bounded relation labelled **Current slice**. Filters, ordered sorts, SQL, and CSV/JSON export apply only to that projection. Changing variables, dimensions, ranges, or decoded/raw mode invalidates the old relation before another query can run.

The pinned NetCDF-C Wasm adapter currently requires a complete authenticated buffer. Files above `structuredData.netcdf.maxSourceBytes` are refused before parsing; slice cell, byte, projection-row, and plot-cell limits are checked before data is read or rendered.

## Default Limits

| Setting | Default |
| --- | ---: |
| Relational ingestion | 64 MiB and 200,000 rows |
| SQL | 30 seconds, 100,000 result rows, 100,000 query characters |
| Worker response | 16 MiB |
| Iceberg metadata/probe | 2 MiB and 10,000 entries |
| NetCDF source | 128 MiB |
| NetCDF slice | 100,000 cells and 16 MiB |
| NetCDF projection/plot | 100,000 rows and 20,000 cells |
| Export | 100,000 rows and 16 MiB |

Operators can lower or raise these values within hard backend maxima. See [configuration](../operations/configuration.md) and the [structured-data runtime](../architecture/structured-data-limits.md).

## Troubleshooting

- **Exact controls or SQL are unavailable:** the complete relational source did not fit configured limits or could not be decoded safely.
- **Open as Iceberg table does not appear:** navigate inside the table root, then wait for its lazy probe. Refresh to invalidate the probe cache.
- **Iceberg is unavailable:** inspect the message, then browse the folder normally. The table may use escaping references, an unsupported format version, or unsupported semantics.
- **A NetCDF variable cannot be combined:** selected variables must use the same dimensions in the same order; Cagnard does not create an implicit scientific join.
- **A NetCDF slice exceeds a limit:** narrow one or more dimension counts before loading it.
- **A query is rejected:** use only the documented `data` relation and read-only analytical SQL. Download remains available for unsupported content.
