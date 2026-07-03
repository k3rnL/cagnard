# Cagnard

Cagnard is a provider-neutral storage browser. Storage is modeled as a capability implemented by plugins, so the same browser can navigate local filesystems, object stores, document drives, and future storage providers through one contract.

The first implementation pass is intentionally small:

- stateless backend driven by configuration
- Scala/tapir HTTP API
- Unix filesystem storage provider
- Refine React frontend
- personal `Home` / `My documents` and admin-configured `Global` storage navigation
- UI plugin declarations for preview and file-specific actions

## Layout

```text
backend/       Scala backend service
frontend/      Refine React application
config/        Example stateless backend configuration
docs/          Maintained feature and operator documentation
examples/      Local filesystem content used by the example config
deploy/        Mocker, Helm, and deployment automation artifacts
openspec/      OpenSpec change artifacts and specs
```

## Documentation

Start with [docs/README.md](docs/README.md). Feature documentation is maintained alongside specs and implementation. Any change that modifies implemented behavior should update the matching page under `docs/features/`.

## Backend

The backend is stateless: it derives providers, accounts, users, access rules, and UI plugin declarations from configuration and external providers.

Run from the repository root:

```bash
sbt backend/run
```

By default the backend reads:

```text
config/cagnard.example.conf
```

Override it with:

```bash
CAGNARD_CONFIG=/path/to/cagnard.conf sbt backend/run
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

## Mocker

Mocker requires Apple's `container` runtime. On macOS, install and start it before building images:

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

The backend image accepts `CAGNARD_CONFIG` for mounted HOCON configuration. The frontend image serves the production build and proxies `/api` to `CAGNARD_API_UPSTREAM`.

## Helm

The chart lives in `deploy/helm/cagnard`.

```bash
helm template cagnard deploy/helm/cagnard
helm install cagnard deploy/helm/cagnard -f deploy/helm/cagnard/examples/demo-values.yaml
```

Use `deploy/helm/cagnard/examples/external-config-values.yaml` as the starting point when the backend config is provided through an existing Kubernetes Secret.

## GitHub Actions

The validation workflow runs backend tests, frontend checks, Mocker builds, and Helm rendering. The publishing workflow can push backend and frontend images to GHCR or another configured registry.

See [docs/features/deployment-packaging.md](docs/features/deployment-packaging.md) and [docs/features/ci-release-automation.md](docs/features/ci-release-automation.md).

## Example User

The example configuration enables a simple configured user:

```text
X-Cagnard-User: alice
```

Requests without this header fall back to the configured default user for local development.
