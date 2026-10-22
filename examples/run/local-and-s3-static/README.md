# Filesystem And S3/MinIO With Static Login

The representative multi-provider demo. It exposes local filesystem roots and MinIO-backed S3 roots in one browser and is suitable for testing cross-provider transfers.

## Start the release

```bash
cp .env.example .env
docker compose up -d
```

Open `http://localhost:5173` and sign in with `alice` / `cagnard`.

MinIO console: `http://127.0.0.1:9001`, using `cagnard` / `cagnard-secret`. The initializer creates `cagnard-combined` and seeds `documents/` and `shared/`.

The filesystem and MinIO global roots both mirror the canonical corpus from `examples/storage/global` (the filesystem root read-only, the S3 copy writable):

- **Structured data** for Parquet, Avro OCF, Arrow IPC/Feather, NDJSON, CSV, and TSV query parity.
- **Iceberg > lineitem** for explicit table opening, snapshots, filters, ordered sorts, and SQL.
- **NetCDF** for groups, dimensions, variables, CF-aware slices, line/heatmap/table views, and bounded SQL projection.

Use the duplicate roots to compare local and S3-backed access without changing viewer behavior.

## Rebuild after editing source

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up --build
```

## Cleanup

```bash
docker compose down --volumes
```

Kubernetes users can start from the [matching example values](../../../deploy/helm/cagnard/examples/local-and-s3-static-values.yaml), as shown in the [Helm guide](../../../docs/getting-started/helm.md). That values file expects an accessible S3-compatible endpoint.

This checkout uses authentication schema v2. The base Compose file pins matching v0.12.1 images; the build override runs local source changes. Cleanup removes containers and named volumes; bind-mounted files remain. The configured browser origin is `http://localhost:5173`; update `auth.publicUrl` when changing it. See the [migration guide](../../../docs/guides/migrating-auth.md).

See [users and storage access](../../../docs/guides/users-and-storage-access.md), [file operations](../../../docs/guides/browsing-and-transfers.md), and the [example catalog](../README.md).

The first run builds MinIO and its client; see [test storage builds](../minio/README.md) for source pins and volume ownership.
