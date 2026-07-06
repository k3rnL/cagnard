# Cagnard

Cagnard is a provider-neutral storage browser. Storage is modeled as a capability implemented by plugins, so the same browser can navigate local filesystems, object stores, document drives, and future storage providers through one contract.

The current implementation includes:

- stateless Go backend driven by HOCON configuration
- provider-neutral HTTP API for browsing, mutation, preview, and transfer jobs
- Unix filesystem and S3-compatible storage providers
- React frontend
- personal `Home` / `My documents` and admin-configured `Global` storage navigation
- UI plugin declarations for preview and file-specific actions

## Layout

```text
backend-go/    Go backend service
frontend/      Refine React application
config/        Example stateless backend configuration
docs/          Maintained feature and operator documentation
examples/      Sample storage content and runnable Docker Compose examples
deploy/        Container, Helm, and deployment automation artifacts
openspec/      OpenSpec change artifacts and specs
```

## Documentation

Start with [docs/README.md](docs/README.md). Feature documentation is maintained alongside specs and implementation. Any change that modifies implemented behavior should update the matching page under `docs/features/`.

## Backend

The backend is stateless: it derives providers, accounts, users, access rules, and UI plugin declarations from configuration and external providers.

Run from the repository root:

```bash
cd backend-go
go run ./cmd/cagnard-backend
```

By default the backend reads:

```text
config/cagnard.example.conf
```

Override it with:

```bash
CAGNARD_CONFIG=/path/to/cagnard.conf go run ./cmd/cagnard-backend
```

The backend configuration format is HOCON. See [docs/configuration.md](docs/configuration.md).

## Frontend

The frontend is a Vite/React app using Refine as the application shell.
Use Node.js 22.13 or newer for the declared `pnpm@11.7.0` package manager.

```bash
cd frontend
pnpm install
pnpm dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8080`.

## Docker

Build local images from the repository root:

```bash
docker build -f Containerfile.backend -t cagnard-backend:local .
docker build -f frontend/Containerfile -t cagnard-frontend:local .
```

The backend image accepts `CAGNARD_CONFIG` for mounted HOCON configuration. The frontend image serves the production build and proxies `/api` to `CAGNARD_API_UPSTREAM`.

Runnable examples are available under `examples/run`. For example:

```bash
cd examples/run/local-filesystem-static
cp .env.example .env
docker compose up --build
```

## Local Mocker Validation

Mocker is used for local image validation on macOS. CI and publishing use Docker.

Mocker requires Apple's `container` runtime. Install and start it before local Mocker builds:

```bash
brew install container
brew tap us/tap
brew install us/tap/mocker
container system start --enable-kernel-install
```

Build local images from the repository root:

```bash
mocker build -f Containerfile.backend -t cagnard-backend:local .
mocker build -f frontend/Containerfile -t cagnard-frontend:local .
```

## Helm

The chart lives in `deploy/helm/cagnard`.

```bash
helm template cagnard deploy/helm/cagnard
helm install cagnard deploy/helm/cagnard -f deploy/helm/cagnard/examples/demo-values.yaml
```

Use `deploy/helm/cagnard/examples/external-config-values.yaml` as the starting point when the backend config is provided through an existing Kubernetes Secret.

Pure Helm values matching the runnable examples are also available under `deploy/helm/cagnard/examples`.

## GitHub Actions

The validation workflow runs Go backend tests, frontend checks, Docker image builds, and Helm rendering on hosted runners. The publishing workflow uses Docker to push backend and frontend images to GHCR or another configured registry.

See [docs/features/deployment-packaging.md](docs/features/deployment-packaging.md) and [docs/features/ci-release-automation.md](docs/features/ci-release-automation.md).

## Example User

The example configuration enables static login for a configured demo user:

```text
User: alice
Password: cagnard
```

Static login issues a signed stateless browser session. Development identity headers are still supported only when `auth.mode = development` is explicitly configured.
