# DuckDB-Wasm Parquet Extension Assets

Cagnard mirrors the official signed DuckDB `parquet` extension for DuckDB 1.4.3 so Parquet inspection works without a runtime CDN dependency. DuckDB-Wasm keeps unsigned extensions disabled and loads only these same-origin assets through its fixed custom extension repository.

| Platform | Official source | SHA-256 |
| --- | --- | --- |
| `wasm_eh` | `https://extensions.duckdb.org/v1.4.3/wasm_eh/parquet.duckdb_extension.wasm` | `22765c8f7dc741cda2b571a66ac7bb355295d7d69a6c37e5315b265672984f55` |
| `wasm_mvp` | `https://extensions.duckdb.org/v1.4.3/wasm_mvp/parquet.duckdb_extension.wasm` | `0785c6c95d003eff4faa7b3b4b660f02c9c92f6d68d135ddf330d42e3a650600` |

The extension and DuckDB are distributed under the MIT license. Preserve the upstream signature and verify both hashes whenever the embedded DuckDB version is upgraded.
