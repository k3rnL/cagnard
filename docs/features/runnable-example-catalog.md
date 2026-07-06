# Runnable Example Catalog

## Behavior

Cagnard provides runnable examples under `examples/run`. They are ordered from simple to richer setups:

1. `local-filesystem-static`: static users with Unix filesystem storage.
2. `s3-minio-static`: static users with S3-compatible storage backed by local MinIO.
3. `local-and-s3-static`: static users with both filesystem and S3/MinIO storage roots.

Every runnable example starts both the Go backend image and frontend. S3 examples also start MinIO and a MinIO initialization service that creates the demo bucket and seeds generated sample files.

## Docker Compose

Run an example from its own directory:

```bash
cp .env.example .env
docker compose up --build
```

The frontend is exposed on `http://127.0.0.1:5173` by default. The backend is exposed on `http://127.0.0.1:8080`.

All examples use the same local demo account:

```text
User: alice
Password: cagnard
```

Stop and remove local resources:

```bash
docker compose down --volumes
```

## Helm Values

Matching pure Helm values live under `deploy/helm/cagnard/examples`:

- `local-filesystem-static-values.yaml`
- `s3-minio-static-values.yaml`
- `local-and-s3-static-values.yaml`

Render an example:

```bash
helm template cagnard deploy/helm/cagnard \
  -f deploy/helm/cagnard/examples/local-filesystem-static-values.yaml
```

The first implementation intentionally does not include Helmfile wrappers. Helmfile users can reference these values files directly.

## Security Boundary

Example credentials are local demo values. They are not production secrets. Replace all session signing secrets, storage credentials, endpoints, bucket names, and access rules before using an example as a deployment base.

## Maintenance Rule

Any future storage provider or authentication method that changes startup configuration must update this catalog. A provider change must add or update a relevant Docker Compose example and matching Helm values when the provider can be configured on Kubernetes. An auth change must add or update a simple example and one relevant provider combination.
