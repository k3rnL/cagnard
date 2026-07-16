# Structured Data Runtime And Limits

Cagnard's analytical viewers run in a dedicated frontend worker. They receive one same-origin `/api/storage/content` URL, never provider credentials, and return normalized pages through a request-ID protocol capped at 16 MB per response. Closing a file aborts reads, closes format state and DuckDB connections, and terminates the dedicated worker.

## Access And Memory Model

| Format | Access | Bound |
| --- | --- | --- |
| Parquet | DuckDB-Wasm HTTP `HEAD` and byte ranges | 500 rows per query, 10 million maximum offset, eight filters, 30 second query timeout |
| Avro OCF | Container buffered; compressed blocks indexed and decoded by requested page | 128 MB container, 500 rows per page |
| Arrow IPC file / Feather | Complete buffer | 64 MB file, 500 rows per page |
| Arrow IPC stream | Record batches consumed incrementally | 128 MB per open stream, 20,000 recently read rows cached |
| NDJSON | 256 KiB ranges with line/byte cursor | 8 MB per record, 500 rows per page |
| CSV / TSV | 256 KiB ranges with quote-aware record cursor | 8 MB per record, 500 rows per page |

The UI defaults to 50 rows because it keeps typical laptop and mobile layouts responsive while still making data inspection useful. The 500-row ceiling and 16 MB worker response limit jointly prevent a small row count with unusually wide nested values from producing an unbounded main-thread message.

Sequential readers do not claim exact whole-file filter or sort support. Arrow streams do not claim an exact count until their end is consumed. Avro reports an exact count from block headers but deliberately avoids decoding all records merely to filter or sort them.

## Reproducible Fixture Benchmark

Run both bounded profiles after regenerating fixtures:

```bash
pnpm --filter @cagnard/frontend fixtures:data
pnpm --filter @cagnard/frontend fixtures:benchmark
pnpm --filter @cagnard/frontend fixtures:benchmark -- --desktop
```

The mobile profile repeatedly processes approximately 8 MB and the desktop profile approximately 64 MB without committing large generated binaries. It measures NDJSON parsing, quote-aware CSV scanning, and Arrow IPC decoding using the deterministic nested/dictionary fixtures. It is a regression signal, not a substitute for browser validation: release validation also opens each format at constrained and desktop viewport sizes.

## Bundled Format Dependencies

| Package | Version | Use | License |
| --- | --- | --- | --- |
| `@duckdb/duckdb-wasm` | 1.32.0 | Local lazy Parquet query engine | MIT |
| `apache-arrow` | 21.1.0 | Arrow IPC/Feather file and stream decoding | Apache-2.0 |
| `avsc` | 5.7.9 | Avro datum/schema decoding | MIT |
| `fflate` | 0.8.2 | Avro raw-deflate blocks | MIT |
| `snappyjs` | 0.7.0 | Avro Snappy blocks | MIT |
| `buffer` | 6.0.3 | Browser-compatible Avro decode buffer | MIT |
| `hyparquet-writer` | 0.16.1 | Development-only deterministic Parquet fixtures | MIT |

DuckDB's worker and WASM binary are emitted as local lazy production assets. No format worker or engine is fetched from a CDN, and DuckDB external extension autoloading and unsigned extensions are disabled.

The signed DuckDB 1.4.3 Parquet extension variants are mirrored under `frontend/public/duckdb-extensions/v1.4.3`. Their official source URLs and SHA-256 hashes are recorded in the adjacent asset README. The worker selects only the matching same-origin signed variant; arbitrary extension names and remote repositories are not exposed to users.
