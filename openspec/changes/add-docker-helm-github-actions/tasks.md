## 1. Container Packaging

- [x] 1.1 Add a backend Containerfile with a multi-stage Scala build and slim JVM runtime image.
- [x] 1.2 Add a frontend Containerfile with a production Vite build and static web server runtime.
- [x] 1.3 Add container ignore files so build contexts exclude generated targets, dependencies, and local-only files.
- [x] 1.4 Ensure the backend image accepts `CAGNARD_CONFIG` and can run with a mounted HOCON file.
- [x] 1.5 Ensure the frontend image serves the built application and supports production `/api` routing to the backend.
- [x] 1.6 Add local Mocker build/run documentation or scripts for both images.

## 2. Helm Chart

- [x] 2.1 Add a Helm chart for backend and frontend workloads, services, labels, and selectors.
- [x] 2.2 Add chart values for image repositories, tags, pull policy, replica counts, services, ingress, resources, and pod annotations.
- [x] 2.3 Add backend configuration values for inline non-secret HOCON ConfigMap rendering.
- [x] 2.4 Add backend configuration values for existing Secret or existing volume-based HOCON configuration.
- [x] 2.5 Add backend and frontend readiness/liveness probes using `/api/health` and the frontend root response.
- [x] 2.6 Add chart examples for local/demo installation and external-secret-based installation.

## 3. GitHub Actions

- [x] 3.1 Add a validation workflow for pull requests and default-branch pushes.
- [x] 3.2 Run backend tests in the validation workflow.
- [x] 3.3 Run frontend typecheck and production build in the validation workflow.
- [x] 3.4 Run Docker build checks for backend and frontend images in the validation workflow.
- [x] 3.5 Run Helm lint/template checks in the validation workflow.
- [x] 3.6 Add an image publishing workflow for tags or manual dispatch with configurable registry, repository, and image tags.
- [x] 3.7 Ensure publishing fails without exposing registry credentials or secret values.

## 4. Documentation

- [x] 4.1 Add deployment packaging feature documentation and link it from the docs index.
- [x] 4.2 Add CI/release automation feature documentation and link it from the docs index.
- [x] 4.3 Update backend configuration documentation with Docker and Helm configuration mounting guidance.
- [x] 4.4 Update README with Mocker, Helm, and GitHub Actions entry points.
- [x] 4.5 Document known limitations and registry/chart publishing assumptions.

## 5. Verification

- [x] 5.1 Run backend tests.
- [x] 5.2 Run frontend typecheck and production build.
- [x] 5.3 Build backend and frontend images locally with Mocker.
- [x] 5.4 Run Helm lint and template rendering for default and external-config values.
- [x] 5.5 Validate GitHub Actions workflow syntax as far as local tooling permits.
- [x] 5.6 Run OpenSpec validation for `add-docker-helm-github-actions`.
