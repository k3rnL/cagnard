## Context

Cagnard currently has a Scala backend, a Vite/React frontend, and a stateless HOCON configuration model. Local development runs the backend through `sbt backend/run` and the frontend through Vite with an `/api` proxy. There is no production packaging path, no Kubernetes deployment artifact, and no CI workflow that validates or publishes deployable artifacts.

The backend configuration is intentionally external. Container and Helm deployment must preserve that property: images must not bake deployment-specific users, provider accounts, storage roots, or secrets into the image.

## Goals / Non-Goals

**Goals:**

- Provide repeatable Mocker builds for the backend and frontend.
- Provide a Helm chart that can deploy Cagnard with external HOCON configuration and Kubernetes-managed secrets.
- Add GitHub Actions workflows that run backend/frontend checks and publish images when configured.
- Keep deployment defaults useful for local clusters while exposing production settings through Helm values.
- Document build, CI, and Helm usage as maintained feature documentation.

**Non-Goals:**

- Full production hardening for every Kubernetes environment.
- A database, persistent session store, or backend-local state.
- Cloud-specific ingress, certificate, DNS, or secret-manager integrations beyond extension points.
- A full release train with signed provenance and SBOM enforcement in the first pass.

## Decisions

### Use separate backend and frontend images

The deployment will build two images:

- `cagnard-backend`: JVM runtime for the Scala HTTP API.
- `cagnard-frontend`: static frontend served by a minimal web server that forwards or targets `/api`.

This matches the current architecture and avoids making the backend responsible for frontend static assets. The alternative was a single image containing both frontend and backend, but that would either require multi-process supervision or a new static-serving responsibility in the Scala backend.

### Keep runtime configuration mounted, not baked into images

The backend image will accept `CAGNARD_CONFIG`, and the Helm chart will mount the HOCON config through a ConfigMap, Secret, or existing volume reference. Sensitive values must remain externalized through environment variables, mounted secret files, or Kubernetes Secret references.

The alternative was to copy `config/cagnard.example.conf` into the image as the production default. The example can remain useful for local demos, but deployments must override it explicitly.

### Helm chart owns deployment composition

The Helm chart will create backend and frontend workloads, services, optional ingress, config mounts, resource settings, and health probes. Values will expose image repositories/tags, pull policy, replica counts, service settings, ingress settings, configuration source, environment variables, and resource requests/limits.

Keeping this in Helm avoids a custom deployment script and gives operators a familiar interface for Kubernetes environments.

### Use Mocker for image builds

Image definitions will use Dockerfile-compatible `Containerfile` inputs, but local and CI commands will use `mocker build` and `mocker push`. This fits the user's preferred container runtime while still producing standard OCI-compatible images.

The alternative was to keep Docker CLI commands because they are ubiquitous in Linux CI. Mocker is preferred here, so CI will target macOS 26 Apple Silicon runners where Apple Containerization and Mocker can run.

### GitHub Actions split validation and publishing

CI will have a validation workflow for pull requests and pushes that runs:

- backend tests
- frontend typecheck/build
- Mocker build checks
- Helm chart lint/template checks

A publishing workflow will build and push container images to a configured registry on tags or manual dispatch. Publishing must be configurable because the repository may not yet have a public registry strategy.

### Documentation follows the feature docs rule

The change will add deployment documentation and CI/release documentation, then link both from the docs index. Existing configuration documentation will be updated with container and Helm-specific config notes.

## Risks / Trade-offs

- Image size grows because the Scala backend needs a JVM runtime -> use a multi-stage build and a slim JRE runtime image.
- Frontend needs a stable API target in production -> serve API requests under `/api` and document the chart's service/ingress expectations.
- Helm defaults could accidentally encourage insecure secrets in values -> document that secret values belong in Kubernetes Secrets or external secret systems.
- CI publishing may fail in forks or local repositories without registry credentials -> keep validation independent from publishing and gate publish steps behind explicit events/secrets.
- Kubernetes readiness checks can be brittle if paths change -> base probes on existing `/api/health` for backend and root HTML response for frontend.

## Migration Plan

1. Add Mocker build files for backend and frontend without changing local development commands.
2. Add Helm chart with local defaults and external configuration hooks.
3. Add GitHub Actions validation workflow.
4. Add optional image publishing workflow with documented registry inputs and required permissions.
5. Update README and feature docs with Mocker, Helm, and CI usage.
6. Verify backend tests, frontend build, Mocker builds, Helm lint/template, and OpenSpec validation.

Rollback is straightforward: remove the packaging, chart, workflow, and documentation files. Runtime API behavior and existing local development commands are not intended to change.

## Open Questions

- Which registry should be the documented default: GHCR, a private registry, or user-provided only?
- Should the first Helm chart publish as an OCI chart, a repository artifact, or just source-controlled chart files?
- Should the frontend image use nginx, Caddy, or another static server base image?
