# Iceberg fixtures

`lineitem/` is DuckDB's official read-only Iceberg example table. It contains two metadata versions, two snapshots, Avro manifests, and Parquet data. Cagnard uses it to verify folder detection, current and historical snapshot reads, range requests, filters, sorts, and SQL.

`unsupported-escape/` intentionally references content outside its table root. The authorized Iceberg source facade must reject that reference rather than exposing another storage path.
