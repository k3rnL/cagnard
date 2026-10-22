# Helm quick start

Install the v0.12.1 chart with matching images and auth v2 configuration. The supplied filesystem example uses static login and an ephemeral writable home. Read [auth migration](../guides/migrating-auth.md) before upgrading an older deployment.

## Prerequisites

- A reachable Kubernetes cluster and configured `kubectl`
- Helm 3
- Access to the chart and images in GHCR
- Permission to create Deployments, Services, ConfigMaps, and Secrets

## Install the filesystem example

Download starter values from the same release as the chart. This disposable example includes demo secrets.

```bash
curl -fsSLo cagnard-demo-values.yaml \
  https://raw.githubusercontent.com/k3rnL/cagnard/v0.12.1/deploy/helm/cagnard/examples/local-filesystem-static-values.yaml

helm upgrade --install cagnard oci://ghcr.io/k3rnl/charts/cagnard \
  --version 0.12.1 -f cagnard-demo-values.yaml

kubectl rollout status deployment/cagnard-backend
kubectl rollout status deployment/cagnard-frontend
kubectl port-forward service/cagnard-frontend 5173:80
```

Open [http://localhost:5173](http://localhost:5173) and sign in with `alice` / `cagnard`. The host and port must match `auth.publicUrl` in the example. The home uses `emptyDir`: data in it can disappear when the pod is replaced.

If GHCR returns `401`, check package visibility or sign in with an account that has package access. See [release artifacts](../operations/releases.md).

## Use your own configuration

Choose one [configuration source](../operations/deployment.md#kubernetes-and-helm). For example, prepare a complete `cagnard.conf` and mount it from a Secret:

```bash
kubectl create secret generic cagnard-config --from-file=cagnard.conf=./cagnard.conf
```

In your values file:

```yaml
backend:
  config:
    inline:
      enabled: false
    existingSecret:
      name: cagnard-config
      key: cagnard.conf
  envFrom:
    - secretRef:
        name: cagnard-runtime
```

Create `cagnard-runtime` through your normal secret-management process for any environment substitutions used by that file. Omit `envFrom` if the file has no substitutions. The chart’s base inline configuration requires `CAGNARD_PUBLIC_URL`, `CAGNARD_SESSION_KEY`, and `CAGNARD_PASSWORD_VERIFIER`; the [full static/OIDC example](../../config/cagnard.oidc.example.conf) uses its own explicitly named secret variables.

Configure durable storage mounts and OS permissions before adding writable filesystem roots. For public ingress, set the external HTTPS origin, Secure cookies, and the exact [OIDC callback](../guides/oidc.md). See [deployment](../operations/deployment.md) for streaming proxy settings and replica limits, and [security](../operations/security.md) for credentials and session behavior.

## Build matching images

From the repository root, replace `registry.example.test/team` with a registry your cluster can pull from. Choose one tag for both images:

```bash
export CAGNARD_REGISTRY=registry.example.test/team
export CAGNARD_TAG=auth-v2-test

docker build -f Containerfile.backend -t "$CAGNARD_REGISTRY/cagnard-backend:$CAGNARD_TAG" .
docker build -f frontend/Containerfile -t "$CAGNARD_REGISTRY/cagnard-frontend:$CAGNARD_TAG" .
docker push "$CAGNARD_REGISTRY/cagnard-backend:$CAGNARD_TAG"
docker push "$CAGNARD_REGISTRY/cagnard-frontend:$CAGNARD_TAG"
```

For a local cluster, loading the two images directly is also an option; use that cluster’s image-loading procedure. Private registries may need `imagePullSecrets` in your values.

To install the local chart with those images, from the repository root:

```bash
helm upgrade --install cagnard ./deploy/helm/cagnard \
  -f deploy/helm/cagnard/examples/local-filesystem-static-values.yaml \
  --set-string backend.image.repository="$CAGNARD_REGISTRY/cagnard-backend" \
  --set-string frontend.image.repository="$CAGNARD_REGISTRY/cagnard-frontend" \
  --set-string backend.image.tag="$CAGNARD_TAG" \
  --set-string frontend.image.tag="$CAGNARD_TAG"
```

## Upgrade or remove

Use matching chart/image versions and reviewed values, following the [release upgrade procedure](../operations/releases.md). For an existing auth configuration, follow [migration and rollback](../guides/migrating-auth.md) first.

```bash
helm uninstall cagnard
```

Uninstalling removes chart-managed resources. Separately managed Secrets and retained provider data need their own lifecycle; uninstall is not a data rollback.
