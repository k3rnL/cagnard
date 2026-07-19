# Filesystem And S3/MinIO With Static Login

The representative multi-provider demo. It exposes local filesystem roots and MinIO-backed S3 roots in one browser and is suitable for testing cross-provider transfers.

## Start Released Images

```bash
cp .env.example .env
docker compose up -d
```

Open `http://127.0.0.1:5173` and sign in with `alice` / `cagnard`.

MinIO console: `http://127.0.0.1:9001`, using `cagnard` / `cagnard-secret`. The initializer creates `cagnard-combined` and seeds `documents/` and `shared/`.

The filesystem and MinIO global roots both include the same generated corpus:

- **Structured data** for Parquet, Avro OCF, Arrow IPC/Feather, NDJSON, CSV, and TSV query parity.
- **Iceberg > lineitem** for explicit table opening, snapshots, filters, ordered sorts, and SQL.
- **NetCDF** for groups, dimensions, variables, CF-aware slices, line/heatmap/table views, and bounded SQL projection.

Use the duplicate roots to compare local and S3-backed access without changing viewer behavior.

## Build The Current Source

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up --build
```

## Cleanup

```bash
docker compose down --volumes
```

Kubernetes users can start from `deploy/helm/cagnard/examples/local-and-s3-static-values.yaml`. That values file expects an accessible S3-compatible endpoint.
