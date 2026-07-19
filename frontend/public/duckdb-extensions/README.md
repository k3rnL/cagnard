# DuckDB-Wasm Extension Assets

Cagnard mirrors the official signed DuckDB `parquet` and `iceberg` extensions for DuckDB 1.4.3, plus Iceberg's signed `avro` dependency, so structured-data inspection works without a runtime CDN dependency. DuckDB-Wasm keeps unsigned extensions and automatic extension installation disabled and loads only these same-origin assets through its fixed custom repository.

| Extension | Platform | Official source | SHA-256 |
| --- | --- | --- | --- |
| `parquet` | `wasm_eh` | `https://extensions.duckdb.org/v1.4.3/wasm_eh/parquet.duckdb_extension.wasm` | `22765c8f7dc741cda2b571a66ac7bb355295d7d69a6c37e5315b265672984f55` |
| `parquet` | `wasm_mvp` | `https://extensions.duckdb.org/v1.4.3/wasm_mvp/parquet.duckdb_extension.wasm` | `0785c6c95d003eff4faa7b3b4b660f02c9c92f6d68d135ddf330d42e3a650600` |
| `iceberg` | `wasm_eh` | `https://extensions.duckdb.org/v1.4.3/wasm_eh/iceberg.duckdb_extension.wasm` | `a58f8df016d86c4c57c7abaded4be344364ec63b768d088502e60cc3776f770f` |
| `iceberg` | `wasm_mvp` | `https://extensions.duckdb.org/v1.4.3/wasm_mvp/iceberg.duckdb_extension.wasm` | `fc504405fb8046f1c4eedbaea795a5e940acd33822e2ec5f8dd16144daebeea3` |
| `avro` | `wasm_eh` | `https://extensions.duckdb.org/v1.4.3/wasm_eh/avro.duckdb_extension.wasm` | `e22ea12d23eb7e5747118f0f1344541bacfe6aeeb664d8c05c2ec8350e4ff498` |
| `avro` | `wasm_mvp` | `https://extensions.duckdb.org/v1.4.3/wasm_mvp/avro.duckdb_extension.wasm` | `c8bfb7d3f51913d5b83ad11a0cedd0200d14ff1bddea4d2aecae89ccc155d9f2` |

The extensions and DuckDB are distributed under the MIT license. Preserve upstream signatures and verify every hash whenever the embedded DuckDB version changes. Re-run filesystem, S3-compatible, current-snapshot, historical-snapshot, cancellation, CSP, and packaged-browser tests before accepting an upgrade.
