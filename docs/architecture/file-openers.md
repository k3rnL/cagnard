# First-Party File Openers

Cagnard selects file experiences from a typed registry compiled into the frontend. Registry entries match MIME types, extensions, normalized categories, capabilities, and safe size strategies. They are maintained application modules, not a public executable plugin API.

## Selection

Lower numeric priority wins after matching and capability checks. MIME and extension rules identify format-specific handlers; extension fallback is intentional because object stores often return `application/octet-stream`. Candidate formats that share a container require content validation: NetCDF-4 validates NetCDF semantic markers and is not selected for arbitrary HDF5.

The registry keeps ordinary JSON separate from NDJSON. A `.json` document uses the bounded JSON editor; `.jsonl` and `.ndjson` use the relational structured-data path when safely complete and retain record-oriented fallback behavior otherwise.

## Runtime Boundaries

Text, Markdown, JSON, YAML, diff, log, media, PDF, and archive surfaces are inline application modules. Analytical formats lazy-load a shared React surface and one reusable structured-data worker per tab. The worker imports only the selected source adapter:

- shared DuckDB-Wasm relations for Parquet and bounded complete CSV/TSV, NDJSON, Avro, Arrow, and Feather;
- the pinned Iceberg extension for explicitly opened table folders;
- a NetCDF-C Wasm facade for semantic datasets and bounded slice projection.

Every worker, Wasm binary, signed extension, and parser chunk is served by Cagnard. No opener code is fetched from a CDN.

## Adapter Contract

An adapter owns source inspection, exact capabilities, schema and metadata, opaque page cursors, optional `data` relation scope, SQL, format-specific actions, cancellation, and cleanup. The viewer consumes that contract for Data, SQL, Schema, Metadata, and optional Snapshots or scientific slice controls.

Relation scope is explicit. A relational file means the complete accepted file, Iceberg means the selected snapshot, and NetCDF means the current bounded slice. A source generation invalidates stale Data and SQL cursors whenever the relation changes.

Filters, ordered sorts, projection, exact counts, and exports appear only when the complete advertised scope can supply them accurately. CSV and JSON exports are bounded to the current or selected result rows and visible columns.

## Security And Lifecycle

Adapters receive an authenticated same-origin Cagnard content URL and validated public limits, never provider credentials. DuckDB SQL is AST-allowlisted, external access is disabled or narrowed to the source facade, extension auto-install is disabled, and worker responses are bounded. Iceberg references resolve through an authorized backend facade. NetCDF is full-buffered only below its configured ceiling.

Closing or replacing a source aborts requests, closes decoder state and DuckDB connections, and unregisters source files. The healthy worker and DuckDB runtime remain reusable; logout, page teardown, or fatal runtime failure terminates them.

See [File viewers](../guides/file-viewers.md), [Explore structured data](../guides/structured-data.md), [adding a first-party opener](../contributing/file-openers.md), and the [`uiPlugins` migration](../guides/migrating-ui-plugins.md).
