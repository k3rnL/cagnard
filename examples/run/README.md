# Runnable Examples

These examples pin Cagnard v0.12.1 and use auth schema v2. Keep configuration and images on matching releases. The MinIO examples [build their test storage service from pinned sources](minio/README.md).

| Example | Storage | Local services | Best for |
| --- | --- | --- | --- |
| [`local-filesystem-static`](local-filesystem-static/) | Unix filesystem | Cagnard | First run and UI evaluation |
| [`s3-minio-static`](s3-minio-static/) | S3-compatible | Cagnard, MinIO | S3 integration |
| [`oidc-keycloak`](oidc-keycloak/) | Filesystem | Keycloak plus host Cagnard | Static + SSO and group mapping |
| [`local-and-s3-static`](local-and-s3-static/) | Filesystem and S3 | Cagnard, MinIO | Cross-provider transfers |

All examples use `alice` / `cagnard` as local demo credentials and expose the frontend at `http://localhost:5173` unless `.env` overrides the port.

The examples enable the generic task queue with four concurrent child items. They can be used immediately to exercise background recursive deletion, native single-file and ZIP downloads, multi-file or directory uploads, and copy or move between the configured roots. Keep the browser tab open while an upload is running because the browser supplies those file streams.

## Standard Workflow

```bash
cd examples/run/local-filesystem-static
cp .env.example .env
docker compose up -d
```

To run local source changes, add the build override:

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up --build
```

Stop an example with `docker compose down --volumes`. Bind-mounted files remain. Stop one example before starting another on the same ports.

Pure Helm values live in [`deploy/helm/cagnard/examples`](../../deploy/helm/cagnard/examples). Demo credentials and MinIO keys are intentionally local-only; replace every secret and configure durable storage before adapting an example for production.

Set `auth.publicUrl` when changing the frontend scheme, hostname, or port. It must match the browser Origin exactly. Keycloak uses the separate host-run workflow in its README.
