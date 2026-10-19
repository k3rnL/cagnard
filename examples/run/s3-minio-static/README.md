# S3/MinIO With Static Login

Runs Cagnard v0.12.0 against local MinIO built from pinned official sources. Initialization creates `cagnard-demo` and seeds generated objects under `documents/`.

## Start the release

```bash
cp .env.example .env
docker compose up -d
```

Open `http://localhost:5173` and sign in with `alice` / `cagnard`.

MinIO console: `http://127.0.0.1:9001`, using `cagnard` / `cagnard-secret`. These are local demo credentials only.

The MinIO initializer mirrors the canonical generated fixtures into the **S3 Documents** root. Open **Structured data** for equivalent relational files, **Iceberg > lineitem** for explicit Iceberg table opening, and **NetCDF** for semantic variable and slice inspection. Provider credentials remain in the backend; the browser receives only authenticated same-origin content and range URLs.

## Rebuild after editing source

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up --build
```

## Cleanup

```bash
docker compose down --volumes
```

Kubernetes users can start from the [matching example values](../../../deploy/helm/cagnard/examples/s3-minio-static-values.yaml), as shown in the [Helm guide](../../../docs/getting-started/helm.md). That values file expects a separately managed S3-compatible service.

This checkout uses authentication schema v2. The base Compose file pins matching v0.12.0 images; the build override runs local source changes. Cleanup removes containers and named volumes; bind-mounted files remain. The configured browser origin is `http://localhost:5173`; update `auth.publicUrl` when changing it. See the [migration guide](../../../docs/guides/migrating-auth.md).

See [users and storage access](../../../docs/guides/users-and-storage-access.md), [file operations](../../../docs/guides/browsing-and-transfers.md), and the [example catalog](../README.md).

The first run builds MinIO and its client; see [test storage builds](../minio/README.md) for source pins and volume ownership.
