# MinIO for local examples and CI

The S3 examples build MinIO and its client from pinned official sources because the previously used public container images are unavailable. Docker builds these automatically on the first `docker compose up`; allow extra time for source and Go dependency downloads. Cagnard itself still uses its released images unless you select the source-build override.

| Component | Upstream version | Source commit |
| --- | --- | --- |
| Server | RELEASE.2025-09-07T16-13-09Z | [07c3a429](https://github.com/minio/minio/commit/07c3a429bfed433e49018cb0f78a52145d4bedeb) |
| Client | RELEASE.2025-08-13T08-35-41Z | [7394ce0d](https://github.com/minio/mc/commit/7394ce0dd2a80935aded936b09fa12cbb3cb8096) |

Both projects use AGPLv3; their source repositories contain the license. These builds support disposable local testing, not a production MinIO support commitment. Use your managed S3 service for production deployments.

To build the server manually from the repository root:

```bash
docker build -f examples/run/minio/Containerfile --target server -t cagnard-minio:local examples/run/minio
```

Use `--target client` to build `mc`. The server runs as UID/GID 1000 and needs a writable `/data` volume. Fresh Docker named volumes inherit that ownership; an existing volume may need an ownership adjustment before reuse.

See the [S3 example](../s3-minio-static/README.md), [combined example](../local-and-s3-static/README.md), and [S3 configuration guide](../../../docs/guides/s3-and-minio.md).
