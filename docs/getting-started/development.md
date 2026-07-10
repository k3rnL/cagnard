# Development Setup

Cagnard has a Go backend and a Vite/React frontend. The backend remains independently runnable and the frontend proxies `/api` during development.

## Prerequisites

- Go version declared by [`backend-go/go.mod`](../../backend-go/go.mod)
- Node.js 22.13 or newer
- pnpm 11.7.0 through Corepack
- Optional Docker for examples and container checks
- Optional Mocker on macOS for local image validation

## Run The Backend

From the repository root:

```bash
cd backend-go
go run ./cmd/cagnard-backend
```

The default config is [`config/cagnard.example.conf`](../../config/cagnard.example.conf). Override it with `CAGNARD_CONFIG=/path/to/cagnard.conf`.

## Run The Frontend

In another terminal:

```bash
corepack enable
pnpm install
cd frontend
pnpm dev --host 0.0.0.0
```

Open `http://127.0.0.1:5173`. Vite proxies API calls to `http://127.0.0.1:8080`.

## Useful Checks

```bash
pnpm backend:test
pnpm --filter @cagnard/frontend test
pnpm --filter @cagnard/frontend build
pnpm examples:check
pnpm docs:check
```

The full validation matrix is documented in [Testing](../contributing/testing.md).

## Container Builds

Docker:

```bash
docker build -f Containerfile.backend -t cagnard-backend:local .
docker build -f frontend/Containerfile -t cagnard-frontend:local .
```

Mocker is intentionally local-only. CI, releases, and Compose use Docker:

```bash
mocker build -f Containerfile.backend -t cagnard-backend:local .
mocker build -f frontend/Containerfile -t cagnard-frontend:local .
```

Use a runnable example's `docker-compose.build.yaml` override to exercise locally built images with real configuration and sample data.
