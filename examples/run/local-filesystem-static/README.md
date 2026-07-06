# Local Filesystem With Static Users

This is the smallest complete Cagnard environment. It starts the Go backend and frontend, uses static login, and exposes generated Unix filesystem sample data.

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

## What It Starts

- Cagnard Go backend on `http://127.0.0.1:8080`
- Cagnard frontend on `http://127.0.0.1:5173`
- Local sample files mounted at `/data` in the backend container

## Cleanup

```bash
docker compose down --volumes
```

The matching Helm values are `deploy/helm/cagnard/examples/local-filesystem-static-values.yaml`.
