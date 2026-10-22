# Local Filesystem With Static Login

The smallest complete Cagnard environment: v0.12.1 frontend and backend images, one static demo user, and generated Unix filesystem content.

## Start the release

```bash
cp .env.example .env
docker compose up -d
```

Open `http://localhost:5173` and sign in with `alice` / `cagnard`.

The **Global** root mounts the canonical corpus from `examples/storage/global` read-only; the **Home** root stays writable:

- **Global > Structured data** contains equivalent Parquet, Avro OCF, Arrow IPC/Feather, NDJSON, CSV, and TSV sources.
- Navigate into **Global > Iceberg > lineitem**, then use the first toolbar action, **Open as Iceberg table**; normal folder navigation remains unchanged.
- **Global > NetCDF** contains classic, CDF-5, NetCDF-4, grouped, compressed, packed, malformed, and bounded large-file fixtures.

`CAGNARD_VERSION` only applies to the base file’s released images; the source-build override uses local images. Ports default to frontend `5173` and backend `8080`.

## Rebuild after editing source

From this directory inside a Cagnard checkout:

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up --build
```

## Cleanup

```bash
docker compose down --volumes
```

Kubernetes users can start from the [matching example values](../../../deploy/helm/cagnard/examples/local-filesystem-static-values.yaml), as shown in the [Helm guide](../../../docs/getting-started/helm.md).

This checkout uses authentication schema v2. The base Compose file pins matching v0.12.1 images; the build override runs local source changes. Cleanup removes containers and named volumes; bind-mounted files remain. The configured browser origin is `http://localhost:5173`; update `auth.publicUrl` when changing it. See the [migration guide](../../../docs/guides/migrating-auth.md).

See [users and storage access](../../../docs/guides/users-and-storage-access.md), [file operations](../../../docs/guides/browsing-and-transfers.md), and the [example catalog](../README.md).
