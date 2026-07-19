# Structured Data Runtime And Limits

Cagnard's analytical viewers lazy-load one structured-data worker per browser tab. The worker receives authenticated same-origin Cagnard URLs, never provider credentials, and owns all parsing, DuckDB connections, source registrations, query cursors, cancellation, and cleanup. Messages are request-ID based and capped by `structuredData.worker.maxResponseBytes`.

DuckDB-Wasm initializes once on first use. Its signed local Parquet and Iceberg extensions load from Cagnard assets, then sequential relational files, Iceberg tables, and NetCDF projections reuse the healthy engine. Every source still has an isolated connection and generation. Closing or replacing a source aborts requests, invalidates cursors, closes its reader and connection, and unregisters virtual files. Logout, page teardown, or a fatal database/worker error terminates the shared runtime; failed initialization is discarded so Retry starts cleanly.

## Source Models

| Source | Access and relation model | Truthful fallback |
| --- | --- | --- |
| Parquet | DuckDB same-origin `HEAD` and byte ranges; exact complete-file `data` | Open error and original download when ranges or format support fail |
| CSV / TSV / NDJSON | Existing range-safe reader, then bounded complete ingestion into DuckDB | Record-safe paging without global operations above ingestion limits |
| Avro OCF | Existing block decoder for null, raw deflate, and Snappy, then bounded complete ingestion | Block paging and source metadata without global operations |
| Arrow IPC / Feather | Bounded Arrow decoding and complete ingestion | Existing bounded reader when the source exceeds limits |
| Iceberg v1/v2 | Same-origin authorized table facade plus pinned DuckDB Iceberg extension; selected snapshot is `data` | Folder remains browsable when references or semantics are unsupported |
| NetCDF classic / NetCDF-4 | Bounded full buffer through NetCDF-C Wasm; explicit slice becomes `data` | Semantic catalog remains visible; user must narrow or download |

Relational ingestion is offered only after the complete source fits both configured byte and row limits. A limited source never advertises visible-page filtering or sorting as a complete-file operation.

## SQL Boundary

The SQL connection exposes one relation named `data`. A PostgreSQL-compatible parser produces an AST and an allowlist accepts one read-only `SELECT` or `WITH ... SELECT` over that relation. It rejects unknown nodes, additional relations, table functions, URLs, mutation, DDL, `COPY`, `ATTACH`, `PRAGMA`, extension commands, and multiple statements.

DuckDB automatic extension installation and loading are disabled. Materialized sources disable external access entirely. Provider-backed Parquet allows only its registered same-origin object path; Iceberg allows only the selected table's same-origin facade directory after the signed extension and initial table binding are complete. The packaged frontend CSP permits same-origin connections and local workers, not arbitrary remote data endpoints. Its only JavaScript-evaluation exception is scoped to the structured-data worker response because the pinned Apache Arrow validity builder generates predicates at runtime; the main application remains evaluation-free.

Validated SQL is wrapped in bounded paging with a result-row ceiling, worker-payload ceiling, timeout, interruption, and relation generation. A source or snapshot change invalidates previous cursors before they can query a new relation accidentally.

## Configuration

| Area | Default | Hard maximum |
| --- | ---: | ---: |
| Relational ingestion bytes | 64 MiB | 512 MiB |
| Relational ingestion rows | 200,000 | 1,000,000 |
| SQL timeout | 30 seconds | 120 seconds |
| SQL result rows | 100,000 | 500,000 |
| SQL query characters | 100,000 | 200,000 |
| Worker response | 16 MiB | 64 MiB |
| Iceberg metadata | 2 MiB | 16 MiB |
| Iceberg probe entries | 10,000 | 100,000 |
| NetCDF source | 128 MiB | 512 MiB |
| NetCDF slice cells | 100,000 | 1,000,000 |
| NetCDF slice bytes | 16 MiB | 64 MiB |
| NetCDF projection rows | 100,000 | 1,000,000 |
| NetCDF plot cells | 20,000 | 100,000 |
| Export rows | 100,000 | 500,000 |
| Export bytes | 16 MiB | 64 MiB |

The backend rejects non-positive or excessive values. Plot and projection limits cannot exceed the slice-cell limit; export bytes cannot exceed the worker response limit. The frontend receives only validated public limits from `/api/structured-data/config` and has conservative compiled defaults for temporary startup failures.

## NetCDF Compatibility

The pinned `@earthyscience/netcdf4-wasm` 0.2.4 adapter packages NetCDF-C as a local 3.2 MiB Wasm asset (`SHA-256 846d75b808abc4258630a558922ac4f4f6251aba317bbb76cb668b59c987c873`). The fixture corpus verifies CDF-1, CDF-2, CDF-5, NetCDF-4 classic and enhanced layouts, groups, unlimited dimensions, chunked/compressed data, CF coordinates, packed/missing values, malformed input, and configured limits.

| Candidate | Compatibility result |
| --- | --- |
| [`@earthyscience/netcdf4-wasm`](https://github.com/EarthyScience/netcdf4-wasm) | Selected. Its NetCDF-C semantic API covered every maintained classic and NetCDF-4 fixture, groups, native codecs, bounded variable reads, explicit close, and worker packaging behind Cagnard's facade. |
| [`netcdfjs`](https://github.com/cheminfo/netcdfjs) | Retained as a possible classic-only fallback. Its public reader model covers classic and 64-bit-offset containers but does not provide one semantic path for CDF-5 plus NetCDF-4/HDF5 groups and codecs. |
| [`h5wasm`](https://github.com/usnistgov/h5wasm) | Rejected as the primary NetCDF reader. It is a capable HDF5 engine, including compound data and optional compression plugins, but would require Cagnard to reconstruct NetCDF dimensions, coordinate variables, conventions, and classic-container support in a second semantic layer. |

The compatibility spike also verified worker cancellation and cleanup, malformed and unsupported inputs, packaged CSP behavior, and filesystem/S3 delivery. The selected dependency remains behind `NetCDFStructuredSource`; changing it must not alter the viewer contract.

The adapter does not expose HTTP random-access handles, so Cagnard buffers the authenticated file up to `maxSourceBytes` and performs bounded hyperslab reads from that in-memory NetCDF-C filesystem. Cancellation is checked around download, hierarchy discovery, variable reads, and projection; close releases the NetCDF handle and DuckDB slice connection. Generic HDF5 is rejected unless NetCDF semantic markers validate it.

## Iceberg Compatibility

DuckDB-Wasm 1.32.0 embeds DuckDB 1.4.3. Cagnard mirrors its signed `parquet` and `iceberg` extensions and Iceberg's signed `avro` dependency for `wasm_eh` and `wasm_mvp`. The verified first release is path-based and read-only for Iceberg format v1/v2. It supports current and explicit historical snapshot IDs and moved paths that remain inside the authorized table facade.

The backend probes metadata independently of the visible folder page, caps metadata size and entry scans, and validates table location, manifest lists, metadata logs, and statistics paths. Foreign buckets, credentials, HTTP/file URLs, absolute filesystem paths, traversal, and escaped facade paths are rejected. External catalogs and unsupported delete semantics are not emulated.

## Reproducible Fixtures

```bash
pnpm --filter @cagnard/frontend fixtures:data
pnpm --filter @cagnard/frontend fixtures:netcdf
pnpm --filter @cagnard/frontend fixtures:benchmark
```

The maintained corpus uses deterministic source data and is small enough for Git and runnable examples. Large-profile benchmarks generate temporary data rather than committing large binaries. `unsupported-compound.nc4` is the one byte-level exception because NetCDF-C/HDF5 records committed-datatype creation times; its values and tested unsupported semantics remain deterministic. Release validation opens equivalent relational files, both Iceberg snapshots, and representative NetCDF variants through filesystem and S3-compatible roots.

## Bundled Dependencies

| Package | Version | Use | License |
| --- | --- | --- | --- |
| `@duckdb/duckdb-wasm` | 1.32.0 | Shared relational and Iceberg query engine | MIT |
| `pgsql-ast-parser` | 12.0.2 | Read-only SQL AST validation | MIT |
| `@earthyscience/netcdf4-wasm` | 0.2.4 | NetCDF-C semantic reader | MIT |
| `apache-arrow` | 21.1.0 | Arrow IPC and DuckDB ingestion batches | Apache-2.0 |
| `avsc` | 5.7.9 | Avro datum and schema decoding | MIT |
| `fflate` | 0.8.2 | Avro raw-deflate blocks | MIT |
| `snappyjs` | 0.7.0 | Avro Snappy blocks | MIT |
| `hyparquet-writer` | 0.16.1 | Development-only deterministic Parquet fixtures | MIT |

All worker, parser, Wasm, and extension assets ship with the frontend; no runtime CDN fetch is required.
