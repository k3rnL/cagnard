# Releases And Upgrades

Cagnard release tags publish a GitHub release, frontend and backend images, and an OCI Helm chart. A tag such as `v0.12.0` maps to image tag `v0.12.0` and chart version `0.12.0`.

Use the exact artifact coordinates from the release notes and check their availability before deploying. v0.12.0 introduces auth v2; follow [migration](../guides/migrating-auth.md) before upgrading an earlier installation. Check configuration compatibility along with chart and image versions.

## Published Artifacts

```text
ghcr.io/k3rnl/cagnard-backend:v0.12.0
ghcr.io/k3rnl/cagnard-frontend:v0.12.0
oci://ghcr.io/k3rnl/charts/cagnard --version 0.12.0
```

GitHub release notes list the exact artifact coordinates. The publishing workflow uses Docker for images and Helm OCI push for the chart.

The [v0.12.0 release notes](../releases/v0.12.0.md) cover auth v2 migration and deployment changes. Maintainers can add `docs/releases/<tag>.md`; the publishing workflow includes that text before artifact coordinates and generated commit notes.

After first publication, set package visibility deliberately in GitHub Packages. A public repository does not automatically make its container packages public. The documented anonymous quick starts require public visibility for the backend image, frontend image, and chart.

## Upgrade A Compose Example

Set the single version value in the example `.env` and recreate both application containers:

```dotenv
CAGNARD_VERSION=v0.12.0
```

```bash
docker compose pull backend frontend
docker compose up -d
```

MinIO and seeded data versions are managed separately by the example.

## Upgrade Helm

Review release notes and values changes, render the chart, then upgrade:

```bash
helm template cagnard oci://ghcr.io/k3rnl/charts/cagnard \
  --version 0.12.0 -f cagnard-values.yaml > rendered.yaml

helm upgrade cagnard oci://ghcr.io/k3rnl/charts/cagnard \
  --version 0.12.0 -f cagnard-values.yaml
```

Keep `backend.image.tag` and `frontend.image.tag` aligned with the application release unless the release notes explicitly describe compatibility across versions.

## Before Upgrading

- Back up the active HOCON and Helm values without exposing them in tickets or logs.
- Confirm changed configuration keys, removed API contracts, and migration diagnostics.
- Test provider listing, login, file opening, and a transfer against non-production data.
- Account for active in-memory tasks and browser streams; let them finish before restarting the backend.
- Confirm the chart and images exist in GHCR before rollout.

Release verification should include anonymous image and chart pulls when the project promises public onboarding. A `401` from `ghcr.io` is a package visibility/access failure, not a Cagnard runtime failure.

## Rollback

Rollback means restoring the previous matching chart/images and compatible configuration. Helm cannot roll back an externally managed Secret or provider data; restore those explicitly when needed. For auth schema changes, follow the [coordinated rollback procedure](../guides/migrating-auth.md#deploy-and-roll-back). Provider writes made by users are not rolled back by deploying an older application. Use provider versioning, snapshots, or backups for content recovery.

Helm users can inspect and restore a prior revision:

```bash
helm history cagnard
helm rollback cagnard <revision>
```
