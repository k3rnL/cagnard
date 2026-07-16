# Filesystem And S3/MinIO With Static Login

The representative multi-provider demo. It exposes local filesystem roots and MinIO-backed S3 roots in one browser and is suitable for testing cross-provider transfers.

## Start Released Images

```bash
cp .env.example .env
docker compose up -d
```

Open `http://127.0.0.1:5173` and sign in with `alice` / `cagnard`.

MinIO console: `http://127.0.0.1:9001`, using `cagnard` / `cagnard-secret`. The initializer creates `cagnard-combined` and seeds `documents/` and `shared/`.

The filesystem and MinIO global roots both include **Structured data**, with generated Parquet, Avro OCF, Arrow IPC/Feather, NDJSON, CSV, and TSV samples. Use them to compare the same first-party viewer over local and S3-backed content access.

## Build The Current Source

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up --build
```

## Cleanup

```bash
docker compose down --volumes
```

Kubernetes users can start from `deploy/helm/cagnard/examples/local-and-s3-static-values.yaml`. That values file expects an accessible S3-compatible endpoint.
