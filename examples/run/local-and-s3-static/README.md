# Local Filesystem And S3 MinIO With Static Users

This example starts the Cagnard Go backend with both filesystem and S3-compatible storage roots. It is useful for testing provider-neutral browsing and transfer-ready setups.

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

- Cagnard Go backend on `http://127.0.0.1:8080`
- Cagnard frontend on `http://127.0.0.1:5173`
- Filesystem roots mounted at `/data`
- MinIO bucket `cagnard-combined` with generated sample objects under `documents/` and `shared/`

## Cleanup

```bash
docker compose down --volumes
```

The matching Helm values are `deploy/helm/cagnard/examples/local-and-s3-static-values.yaml`.
