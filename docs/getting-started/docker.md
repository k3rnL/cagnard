# Docker Quick Start

This path runs v0.12.1 with local filesystem storage and static login. You need Git, Docker, and Docker Compose. The version-two configuration requires matching backend/frontend images; releases before v0.12.0 cannot load it.

For an existing deployment, first read the [auth migration guide](../guides/migrating-auth.md). To try SSO as well, use the [Keycloak exercise](../../examples/run/oidc-keycloak/README.md).

## Start Cagnard

```bash
git clone --branch v0.12.1 --depth 1 https://github.com/k3rnL/cagnard.git
cd cagnard/examples/run/local-filesystem-static
cp .env.example .env
docker compose up -d
```

Open [http://localhost:5173](http://localhost:5173) and sign in:

```text
User: alice
Password: cagnard
```

The frontend proxies `/api` to the backend container. The backend reads the mounted `cagnard.conf` and exposes sample personal and global filesystem roots from `data/`.

Open **Global > Structured data** to try generated Parquet, Avro OCF, Arrow IPC/Feather, NDJSON, CSV, and TSV files. The same deterministic fixture set includes malformed/truncated samples for error-state testing and is documented in [`examples/storage/global/structured-data`](../../examples/storage/global/structured-data/README.md).

## Check The Services

```bash
docker compose ps
docker compose logs -f backend frontend
```

The backend health endpoint is available at `http://127.0.0.1:8080/api/health`.

## Registry troubleshooting

A `401` while pulling an image is a registry access issue, before Cagnard starts. Use an image/tag available to your account or have the package owner grant access. Source builds avoid pulling Cagnard release images, but still need their base images. MinIO examples [build pinned upstream sources](../../examples/run/minio/README.md), so their first run also needs access to GitHub and Go dependencies. The [filesystem example](../../examples/run/local-filesystem-static/README.md) does not require MinIO.

## Select A Version

`.env` contains one release selector:

```dotenv
CAGNARD_VERSION=v0.12.1
```

This selector applies when pulling released images without the build override. Use the configuration from the same release tag. Releases before v0.12.0 do not support this checkout’s v2 authentication configuration. Follow [migration](../guides/migrating-auth.md) when changing binary and configuration together.

## Try Multiple Providers

The combined example adds MinIO and exposes filesystem and S3 roots in the same browser:

```bash
cd ../local-and-s3-static
cp .env.example .env
docker compose up -d
```

Stop the first example before starting another with the same ports. Changing `FRONTEND_PORT` also requires updating `auth.publicUrl` in its `cagnard.conf`.

Use the pasteboard to copy files between the local and S3 roots. Both roots expose the structured-data fixture set so the viewers can be compared across filesystem and authorized S3 range access. MinIO's console is at `http://127.0.0.1:9001` with the local demo credentials documented in that example.

## Build Your Checkout

To build or rebuild local source, add the build override:

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up --build
```

On macOS, Mocker is also available for local image validation, but Docker remains the runtime for Compose examples and CI. See [Development setup](development.md).

## Stop And Remove Demo Data

```bash
docker compose down --volumes
```

This removes containers and named volumes. It does not delete bind-mounted files in `data/` or the shared example corpus; reset those separately only if you intend to discard your changes.

All included passwords, MinIO keys, and session protection keys are demo values. Do not reuse them outside a local disposable environment.
