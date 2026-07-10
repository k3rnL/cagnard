# Deployment

Cagnard is delivered as two images and one Helm chart:

- `ghcr.io/k3rnl/cagnard-backend:<release>`
- `ghcr.io/k3rnl/cagnard-frontend:<release>`
- `oci://ghcr.io/k3rnl/charts/cagnard --version <release without v>`

Use matching frontend and backend release tags. The frontend serves static assets and proxies `/api` to the backend; only the frontend normally needs public ingress.

## Containers

The backend requires a HOCON file and access to every configured provider endpoint or filesystem path. The frontend requires `CAGNARD_API_UPSTREAM` when its API upstream is not the default backend service name.

Use a runnable example as a deployment rehearsal:

```bash
cd examples/run/local-and-s3-static
cp .env.example .env
docker compose up -d
docker compose ps
```

The examples use release images by default. Add `docker-compose.build.yaml` only when testing a source checkout.

## Kubernetes And Helm

The chart creates separate frontend and backend Deployments and Services. Backend configuration can come from exactly one source:

- `backend.config.inline`
- `backend.config.existingConfigMap`
- `backend.config.existingSecret`
- `backend.config.existingVolume`

Production deployments usually mount secret-bearing HOCON from an existing Secret or external-secret-managed volume. Keep the chart version and both image tags pinned to a tested release.

The chart can route `/api` to the backend through one Ingress when `ingress.routeApiToBackend` is enabled. Terminate TLS at the ingress and set `auth.session.secureCookies = true`.

## Filesystem Storage

Container filesystems are ephemeral. If a filesystem provider stores real data, mount a persistent volume at the exact path used by each root. Ensure the backend process can read and, for writable roots, create content there. Multiple backend replicas must see the same filesystem and still do not share transfer-task memory.

S3 roots do not need a data volume, but their endpoint and credentials must be reachable from every backend pod.

## Health And Rollout

`GET /api/health` reports service readiness and safe aggregate configuration state. The Helm chart uses it for liveness and readiness probes.

After rollout, verify:

```bash
kubectl rollout status deployment/cagnard-backend
kubectl rollout status deployment/cagnard-frontend
kubectl port-forward service/cagnard-frontend 5173:80
```

Then test authentication, visible roots, one listing, and expected read-only behavior.

## Scaling Limits

The request API is stateless, but active transfer jobs are currently held in backend memory. A backend restart loses active task state, and replicas do not share a queue. Until a durable task store is introduced, use one backend replica when users depend on transfer progress and conflict resolution. Provider data already written remains in the provider.

## Production Checklist

- Replace all demo verifier material, access keys, and signing secrets.
- Use TLS and secure cookies.
- Mount durable filesystem roots or use external object storage.
- Apply CPU/memory requests and limits based on transfer and opener workloads.
- Restrict backend network access and filesystem mounts to required providers.
- Configure log collection without secret-bearing configuration dumps.
- Validate backup, object versioning, retention, and deletion behavior at the provider layer.
- Test upgrades with the exact chart, frontend image, backend image, and configuration combination.

See [Security](security.md) and [Releases and upgrades](releases.md).
