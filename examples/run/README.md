# Runnable Examples

Each directory is a complete Cagnard starter environment. Docker Compose uses matching released frontend and backend images by default; a build override is included for contributors working from source.

| Example | Storage | Local services | Best for |
| --- | --- | --- | --- |
| [`local-filesystem-static`](local-filesystem-static/) | Unix filesystem | Cagnard | First run and UI evaluation |
| [`s3-minio-static`](s3-minio-static/) | S3-compatible | Cagnard, MinIO | S3 integration |
| [`local-and-s3-static`](local-and-s3-static/) | Filesystem and S3 | Cagnard, MinIO | Cross-provider transfers |

All examples use `alice` / `cagnard` as local demo credentials and expose the frontend at `http://127.0.0.1:5173` unless `.env` overrides the port.

The examples enable the generic task queue with four concurrent child items. They can be used immediately to exercise background recursive deletion, native single-file and ZIP downloads, multi-file or directory uploads, and copy or move between the configured roots. Keep the browser tab open while an upload is running because the browser supplies those file streams.

## Standard Workflow

```bash
cd examples/run/local-filesystem-static
cp .env.example .env
docker compose up -d
```

To build the checkout instead of pulling a release:

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up --build
```

Stop an example with `docker compose down --volumes`.

Pure Helm values live in [`deploy/helm/cagnard/examples`](../../deploy/helm/cagnard/examples). Demo credentials and MinIO keys are intentionally local-only; replace every secret and configure durable storage before adapting an example for production.
