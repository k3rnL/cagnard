# First-Party File Openers

Cagnard selects file experiences from a typed registry compiled into the frontend. Registry entries match MIME types, extensions, and normalized categories, declare required storage capabilities and content strategies, and point to inline or lazy runtime code. They are implementation modules, not a public plugin API.

## Selection

Lower numeric priority wins after all matching, capability, and size checks pass. MIME and extension rules identify format-specific analytical handlers; broad categories identify experiences such as text, image, PDF, or archive. Extension fallback is intentional because S3-compatible stores frequently return `application/octet-stream`.

The registry keeps ordinary JSON separate from NDJSON. A `.json` document uses the bounded JSON editor, while `.jsonl` and `.ndjson` use a record-oriented worker and byte cursor.

## Runtime Boundaries

Existing text, Markdown, JSON, YAML, diff, log, media, PDF, and archive surfaces are inline application modules. Structured-data formats lazy-load a shared React surface and one reusable worker per browser tab. The worker then imports only the selected format reader:

- DuckDB-Wasm for Parquet;
- Avro OCF decoding for null, deflate, and Snappy codecs;
- Apache Arrow JavaScript for IPC file, stream, and Feather;
- range-aware UTF-8 readers for NDJSON, CSV, and TSV.

DuckDB’s worker, WASM binary, and every reader chunk are served by the Cagnard frontend. No extension, worker, or parser code is fetched from a CDN.

## Structured Data Contract

Readers normalize schema fields, logical and physical types, metadata sections, bounded row pages, opaque cursors, exact operation capabilities, and safe errors. The viewer exposes Data, Schema, and Metadata tabs. Filtering, sorting, projection, and total counts appear only when the reader can apply them to the complete source accurately.

All analytical viewers are read-only. CSV and JSON exports contain only the visible page or selected page rows and columns, and filenames include `.page` to make that scope explicit.

## Security And Lifecycle

The frontend receives an authenticated, same-origin Cagnard content URL, never provider credentials. Parquet’s HTTP filesystem uses byte ranges against that URL and refuses full-file HTTP fallback. Closing or replacing a view cancels that source's outstanding requests, closes reader state and its DuckDB connection, and unregisters its unique virtual file. The healthy worker and lazy DuckDB engine remain available for later files in the same tab; logout, fatal runtime failure, and page teardown terminate them.

See [File viewers](../guides/file-viewers.md), [adding a first-party opener](../contributing/file-openers.md), and the [`uiPlugins` migration](../guides/migrating-ui-plugins.md).
