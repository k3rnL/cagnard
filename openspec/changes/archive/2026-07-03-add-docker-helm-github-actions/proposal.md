## Why

Cagnard currently runs well as a local prototype, but it lacks a repeatable way to build, publish, and deploy the application. Docker, Helm, and GitHub Actions are needed so the stateless backend and Refine frontend can be tested and operated consistently outside a developer workstation. Mocker remains useful for local macOS image validation.

## What Changes

- Add Docker-compatible OCI image packaging for the Cagnard application, including production build steps for the Scala backend and React frontend.
- Add a Helm chart for Kubernetes deployments with configurable image, ingress/service settings, resource settings, and mounted HOCON configuration.
- Add GitHub Actions workflows for build/test validation and container image publishing.
- Document local image builds, chart usage, required configuration, and deployment limitations.
- Preserve the stateless backend model: runtime configuration remains externalized through HOCON config files, environment variables, and Kubernetes secrets/config maps.
- No **BREAKING** runtime API changes are intended.

## Capabilities

### New Capabilities

- `deployment-packaging`: Docker-built image and Helm chart behavior for packaging and deploying Cagnard, with local Mocker validation support.
- `ci-release-automation`: GitHub Actions behavior for validating changes and publishing deployable artifacts.

### Modified Capabilities

- `stateless-backend-configuration`: Container and Helm deployments must provide backend configuration without introducing required application database state.

## Impact

- Adds repository-level Containerfile and container build context decisions.
- Adds Helm chart files under a deployment/chart directory.
- Adds GitHub Actions workflow files under `.github/workflows/`.
- Updates README and docs with build, publish, and deployment instructions.
- May add build plugin or script support for assembling the Scala backend artifact and frontend static assets.
- CI will exercise existing backend tests and frontend typecheck/build before packaging artifacts.
