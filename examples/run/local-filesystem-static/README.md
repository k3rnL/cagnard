# Local Filesystem With Static Login

The smallest complete Cagnard environment: released frontend and backend images, one static demo user, and generated Unix filesystem content.

## Start Released Images

```bash
cp .env.example .env
docker compose up -d
```

Open `http://127.0.0.1:5173` and sign in with `alice` / `cagnard`.

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
