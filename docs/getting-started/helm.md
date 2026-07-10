# Helm Quick Start

Cagnard publishes its chart as an OCI artifact at `oci://ghcr.io/k3rnl/charts/cagnard`. This demo uses static login and an ephemeral filesystem root.

GHCR package visibility is independent of repository visibility. An anonymous install requires the chart and both images to be public. If Helm returns `401`, the package owner must make the chart public or grant your GitHub account package access; an authorized account can then run `helm registry login ghcr.io` before installation.

## Prerequisites

- A reachable Kubernetes cluster
- `kubectl` configured for that cluster
- Helm 3 with OCI support
- Permission to create Deployments, Services, ConfigMaps, and Secrets in the target namespace

## Install A Released Chart

Download the matching starter values, then install the published chart:

```bash
curl -fsSLo cagnard-demo-values.yaml \
  https://raw.githubusercontent.com/k3rnL/cagnard/v0.6.2/deploy/helm/cagnard/examples/local-filesystem-static-values.yaml

helm install cagnard oci://ghcr.io/k3rnl/charts/cagnard \
  --version 0.6.2 \
  -f cagnard-demo-values.yaml
```

Wait for the frontend and backend:

```bash
kubectl rollout status deployment/cagnard-backend
kubectl rollout status deployment/cagnard-frontend
```

## Open The Browser

```bash
kubectl port-forward service/cagnard-frontend 5173:80
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) and sign in with `alice` / `cagnard`.

The starter is disposable. It uses demo verifier material, an inline signing secret, and non-durable local storage.

## Production Adaptation

Before exposing Cagnard beyond a test cluster:

1. Put secret-bearing HOCON in an existing Kubernetes Secret or mounted external-secret volume.
2. Replace demo credentials and the session signing secret.
3. Configure durable provider storage; pod-local filesystem content is not durable.
4. Configure ingress, TLS, secure cookies, resource requests/limits, and backup policy.
5. Pin the chart and image versions you have validated.

See [Deployment](../operations/deployment.md), [Security](../operations/security.md), and the [configuration reference](../reference/configuration.md).

## Upgrade Or Remove

```bash
helm upgrade cagnard oci://ghcr.io/k3rnl/charts/cagnard \
  --version 0.6.2 \
  -f cagnard-demo-values.yaml

helm uninstall cagnard
```
