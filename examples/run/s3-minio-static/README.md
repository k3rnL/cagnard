# S3/MinIO With Static Login

Runs released Cagnard images against local MinIO. Initialization creates `cagnard-demo` and seeds generated objects under `documents/`.

## Start Released Images

```bash
cp .env.example .env
docker compose up -d
```

Open `http://127.0.0.1:5173` and sign in with `alice` / `cagnard`.

MinIO console: `http://127.0.0.1:9001`, using `cagnard` / `cagnard-secret`. These are local demo credentials only.

The MinIO initializer mirrors the canonical generated fixtures into the **S3 Documents** root. Open **Structured data** for equivalent relational files, **Iceberg > lineitem** for explicit Iceberg table opening, and **NetCDF** for semantic variable and slice inspection. Provider credentials remain in the backend; the browser receives only authenticated same-origin content and range URLs.

## Build The Current Source

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up --build
```

## Cleanup

```bash
docker compose down --volumes
```

Kubernetes users can start from `deploy/helm/cagnard/examples/s3-minio-static-values.yaml`. That values file expects a separately managed S3-compatible service.
