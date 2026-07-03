# Runnable Examples

This directory contains complete Cagnard starter environments. Each example is designed to run from its own directory with Docker Compose and has matching pure Helm values under `deploy/helm/cagnard/examples`.

## Example Matrix

| Example | Storage | Auth | Local services | Frontend | Backend | Helm values |
| --- | --- | --- | --- | --- | --- | --- |
| `local-filesystem-static` | Unix filesystem | Static users | Cagnard frontend, Cagnard backend | `http://127.0.0.1:5173` | `http://127.0.0.1:8080` | `deploy/helm/cagnard/examples/local-filesystem-static-values.yaml` |
| `s3-minio-static` | S3-compatible object storage | Static users | Cagnard frontend, Cagnard backend, MinIO, MinIO init | `http://127.0.0.1:5173` | `http://127.0.0.1:8080` | `deploy/helm/cagnard/examples/s3-minio-static-values.yaml` |
| `local-and-s3-static` | Unix filesystem plus S3-compatible object storage | Static users | Cagnard frontend, Cagnard backend, MinIO, MinIO init | `http://127.0.0.1:5173` | `http://127.0.0.1:8080` | `deploy/helm/cagnard/examples/local-and-s3-static-values.yaml` |

All examples use this demo login:

```text
User: alice
Password: cagnard
```

## Running an Example

From a runnable example directory:

```bash
cp .env.example .env
docker compose up --build
```

Open `http://127.0.0.1:5173` and log in with the demo account.

Stop and remove local resources:

```bash
docker compose down --volumes
```

## Security Boundary

Credentials in these examples are local-only demo values. They are safe for trying Cagnard on a developer machine and are not production secrets. Replace all credentials, session signing secrets, storage endpoints, and bucket names before using an example as the basis for a real deployment.

## Maintenance Rule

Every future storage provider or authentication method that changes how Cagnard is started or configured must update this catalog. Add or update a Docker Compose example and matching pure Helm values for each relevant starter combination.
