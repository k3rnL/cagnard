# Deployment Packaging

## Behavior

Cagnard ships as two deployable container images:

- `cagnard-backend`: Scala HTTP API running on port `8080`.
- `cagnard-frontend`: production React assets served by nginx on port `8080`.

The frontend uses relative `/api` calls. In container and Kubernetes deployments, `/api` can reach the backend through either the frontend nginx proxy or an ingress path routed directly to the backend service.

## Docker

Build the backend image from the repository root:

```bash
docker build -f Containerfile.backend -t cagnard-backend:local .
```

Build the frontend image:

```bash
docker build -f frontend/Containerfile -t cagnard-frontend:local .
```

The backend image includes the example config and example filesystem content for local demos. Production deployments should mount their own HOCON config and set `CAGNARD_CONFIG`.

Example backend run with a mounted config:

```bash
docker run --rm \
  -p 8080:8080 \
  -e CAGNARD_CONFIG=/etc/cagnard/cagnard.conf \
  -v "$PWD/config/cagnard.example.conf:/etc/cagnard/cagnard.conf:ro" \
  cagnard-backend:local
```

Example frontend run with an API upstream:

```bash
docker run --rm \
  -p 5173:8080 \
  -e CAGNARD_API_UPSTREAM=http://<backend-reachable-host>:8080 \
  cagnard-frontend:local
```

## Runnable Docker Compose Examples

Runnable examples live under `examples/run` and start both backend and frontend services:

- `local-filesystem-static`: static users with filesystem storage.
- `s3-minio-static`: static users with S3-compatible storage backed by MinIO.
- `local-and-s3-static`: static users with filesystem and S3/MinIO storage roots.

From an example directory:

```bash
cp .env.example .env
docker compose up --build
```

S3 examples include MinIO and an initialization service that creates the bucket and seeds generated sample files.

## Local Mocker Validation

Mocker requires Apple's `container` runtime on macOS:

```bash
brew install container
brew tap us/tap
brew install us/tap/mocker
container system start --enable-kernel-install
```

Build the backend image from the repository root:

```bash
mocker build -f Containerfile.backend -t cagnard-backend:local .
```

Build the frontend image:

```bash
mocker build -f frontend/Containerfile -t cagnard-frontend:local .
```

Mocker builds the same Dockerfile-compatible `Containerfile` inputs and is used only for local macOS validation. CI, publishing, and general deployment documentation use Docker.

## Helm

The Helm chart lives at:

```text
deploy/helm/cagnard
```

Render the chart with defaults:

```bash
helm template cagnard deploy/helm/cagnard
```

Install with locally built images in a local cluster:

```bash
helm install cagnard deploy/helm/cagnard \
  -f deploy/helm/cagnard/examples/demo-values.yaml
```

Render a runnable example values file:

```bash
helm template cagnard deploy/helm/cagnard \
  -f deploy/helm/cagnard/examples/local-filesystem-static-values.yaml
```

The chart examples are pure Helm values. Helmfile wrappers are not provided; Helmfile users can reference these values files from their own Helmfile definitions.

Use an existing Kubernetes Secret for backend config:

```bash
kubectl create secret generic cagnard-backend-config \
  --from-file=cagnard.conf=/path/to/cagnard.conf

helm install cagnard deploy/helm/cagnard \
  -f deploy/helm/cagnard/examples/external-config-values.yaml
```

## Configuration

The chart supports:

- inline non-secret HOCON rendered as a ConfigMap
- existing ConfigMap references
- existing Secret references
- existing volume sources
- image repository, tag, pull policy, ingress, service, resources, replica count, and pod annotation overrides

Secrets should not be written into `values.yaml`. Use Kubernetes Secrets, mounted files, or an external secret operator.

## Known Limitations

- The chart is source-controlled only; OCI chart publishing is not implemented yet.
- The default inline config is for demos and local clusters, not production.
- The first chart does not include cloud-specific ingress annotations, certificate automation, or external secret controller templates.
- The S3/MinIO Helm values assume a reachable MinIO or S3-compatible service; the Cagnard chart does not deploy MinIO as a chart dependency.
- The backend image uses a JVM runtime image and is not yet optimized with jlink or native-image.

## Example Maintenance

Storage provider and authentication changes must update runnable examples when they affect startup configuration. Add or update a Docker Compose example and matching Helm values for each relevant starter combination.
