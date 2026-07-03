# S3 MinIO With Static Users

This example starts Cagnard with an S3-compatible storage provider backed by local MinIO. The MinIO init service creates a bucket and seeds generated sample files.

## Start

```bash
cp .env.example .env
docker compose up --build
```

Open `http://127.0.0.1:5173`.

```text
User: alice
Password: cagnard
```

MinIO is available at:

- API: `http://127.0.0.1:9000`
- Console: `http://127.0.0.1:9001`
- User: `cagnard`
- Password: `cagnard-secret`

## What It Starts

- Cagnard backend on `http://127.0.0.1:8080`
- Cagnard frontend on `http://127.0.0.1:5173`
- MinIO S3-compatible object storage
- MinIO initialization that creates `cagnard-demo` and seeds `documents/`

## Cleanup

```bash
docker compose down --volumes
```

The matching Helm values are `deploy/helm/cagnard/examples/s3-minio-static-values.yaml`.
