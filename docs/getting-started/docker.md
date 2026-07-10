# Docker Quick Start

This path runs released Cagnard images with local filesystem storage and static login. You need Git, Docker, and Docker Compose; Go and Node.js are not required.

The release images are hosted on GHCR. For anonymous onboarding, their package visibility must be **Public** independently of repository visibility. If a pull returns `401`, the package owner must correct visibility or grant your GitHub account package access. To continue from the checkout immediately, use the [source-build command](#build-your-checkout) instead.

## Start Cagnard

```bash
git clone https://github.com/k3rnL/cagnard.git
cd cagnard/examples/run/local-filesystem-static
cp .env.example .env
docker compose up -d
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) and sign in:

```text
User: alice
Password: cagnard
```

The frontend proxies `/api` to the backend container. The backend reads the mounted `cagnard.conf` and exposes sample personal and global filesystem roots from `data/`.

## Check The Services

```bash
docker compose ps
docker compose logs -f backend frontend
```

The backend health endpoint is available at `http://127.0.0.1:8080/api/health`.

## Select A Version

`.env` contains one release selector:

```dotenv
CAGNARD_VERSION=v0.6.2
```

Frontend and backend must use compatible versions. Update this value to another published release tag when testing an upgrade.

## Try Multiple Providers

The combined example adds MinIO and exposes filesystem and S3 roots in the same browser:

```bash
cd ../local-and-s3-static
cp .env.example .env
docker compose up -d
```

Use the pasteboard to copy files between the local and S3 roots. MinIO's console is at `http://127.0.0.1:9001` with the local demo credentials documented in that example.

## Build Your Checkout

To build local source instead of pulling a release:

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up --build
```

On macOS, Mocker is also available for local image validation, but Docker remains the runtime for Compose examples and CI. See [Development setup](development.md).

## Stop And Remove Demo Data

```bash
docker compose down --volumes
```

All included passwords, MinIO keys, and signing secrets are demo values. Do not reuse them outside a local disposable environment.
