# Local Filesystem With Static Login

The smallest complete Cagnard environment: released frontend and backend images, one static demo user, and generated Unix filesystem content.

## Start Released Images

```bash
cp .env.example .env
docker compose up -d
```

Open `http://127.0.0.1:5173` and sign in with `alice` / `cagnard`.

The read-only generated corpus is mounted alongside the writable demo files:

- **Global > Structured data** contains equivalent Parquet, Avro OCF, Arrow IPC/Feather, NDJSON, CSV, and TSV sources.
- Navigate into **Global > Iceberg > lineitem**, then use the first toolbar action, **Open as Iceberg table**; normal folder navigation remains unchanged.
- **Global > NetCDF** contains classic, CDF-5, NetCDF-4, grouped, compressed, packed, malformed, and bounded large-file fixtures.

`CAGNARD_VERSION` in `.env` selects the matching frontend and backend release. Ports default to frontend `5173` and backend `8080`.

## Build The Current Source

From this directory inside a Cagnard checkout:

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up --build
```

## Cleanup

```bash
docker compose down --volumes
```

Kubernetes users can start from `deploy/helm/cagnard/examples/local-filesystem-static-values.yaml`.
