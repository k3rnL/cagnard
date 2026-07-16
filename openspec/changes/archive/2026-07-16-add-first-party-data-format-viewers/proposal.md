## Why

Cagnard recognizes several analytical data formats but cannot inspect them, while its frontend "plugin" manifests can only select hard-coded React views and therefore do not provide meaningful third-party extensibility. Replacing that configuration layer with first-party format handlers creates a coherent base for large-file-safe Parquet, Avro, Arrow, NDJSON, and CSV inspection without carrying a misleading plugin API.

## What Changes

- Add a shared, read-only structured-data viewer with Data, Schema, and Metadata views, bounded result sets, nested-value rendering, pagination, filtering, sorting, column selection, cancellation, and safe export of displayed rows.
- Add first-party support for Parquet using lazily loaded DuckDB-Wasm in a Web Worker and Cagnard's authorized HTTP range delivery, subject to a compatibility spike and a backend fallback if authenticated range access is not viable.
- Add first-party readers for Avro Object Container Files and Arrow IPC/Feather, including format-specific schema and container metadata.
- Give NDJSON/JSON Lines a record-oriented viewer instead of treating the whole file as one JSON document, and migrate CSV/TSV inspection to the shared large-data table behavior.
- Replace server-supplied UI opener manifests with a typed, compile-time first-party opener and data-source registry whose implementations can be lazy-loaded.
- **BREAKING** Remove `uiPlugins` from HOCON configuration, Helm values, and runnable examples, and remove the authenticated `GET /api/plugins/ui` endpoint and its frontend API types/state.
- Keep storage-provider plugins and their capability negotiation intact; only the frontend UI-plugin contract is removed.
- Keep Parquet, Avro, Arrow/Feather, NDJSON, and CSV/TSV inspection read-only. Editing or rewriting analytical files is not introduced.
- Keep Iceberg, Delta Lake, Hudi, ORC, database-file querying, and dataset-level discovery outside this change.

## Capabilities

### New Capabilities

- `structured-data-file-inspection`: First-party, large-file-aware inspection of Parquet, Avro OCF, Arrow IPC/Feather, NDJSON, CSV, and TSV through a common data, schema, and metadata experience.

### Modified Capabilities

- `file-openers-and-editors`: Replace first-party/plugin opener parity with a typed first-party registry and define lazy, cancellable analytical format opening.
- `file-type-catalog`: Add consistent backend and frontend classification for the supported analytical formats and distinguish record-oriented JSON from ordinary JSON documents.
- `ui-plugin-system`: Remove the frontend plugin extension, manifest, ordering, isolation, and provider-coordination contract.
- `stateless-backend-configuration`: Remove UI plugin declarations from the backend HOCON source-of-truth contract and configuration examples.
- `runnable-example-catalog`: Remove UI plugin manifest requirements from example currency and validation expectations.
- `storage-plugin-system`: Express content-access and mutation capability coordination in terms of first-party openers rather than frontend plugins while preserving provider-neutral range and stream access.

## Impact

- Frontend opener registry, file-type catalog, file-opening state, viewer components, workers, tests, build assets, and dependencies.
- Backend configuration models and decoding, API routing and models, MIME classification, authorized content delivery tests, and potentially a narrowly scoped content-handle fallback discovered by the DuckDB-Wasm spike.
- HOCON examples, Docker Compose examples, Helm values, configuration reference, architecture documentation, file-format guides, and migration notes.
- New locally served DuckDB-Wasm worker, WASM, and Parquet extension assets; Arrow/Avro decoding dependencies selected during implementation must support browser workers and bounded memory use.
- Existing deployments that configure `uiPlugins` must remove that section when upgrading.
