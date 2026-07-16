# deployment-packaging Specification

## Purpose
TBD - created by archiving change add-docker-helm-github-actions. Update Purpose after archive.
## Requirements
### Requirement: Backend container image
Cagnard SHALL provide a Docker-compatible build for the backend runtime that starts the Go HTTP service without requiring developer tooling in the final runtime image.

#### Scenario: Build backend image
- **WHEN** an operator builds the backend image from the repository
- **THEN** the resulting image SHALL contain the compiled Go backend binary and static runtime assets needed to execute it without sbt, Scala, or a JVM

#### Scenario: Run backend image with external config
- **WHEN** the backend container starts with `CAGNARD_CONFIG` pointing to a mounted HOCON file
- **THEN** Cagnard SHALL load runtime configuration from that mounted file

### Requirement: Frontend container image
Cagnard SHALL provide a Docker-compatible build for the frontend that serves the production React application as static assets.

#### Scenario: Build frontend image
- **WHEN** an operator builds the frontend image from the repository
- **THEN** the resulting image SHALL contain the production frontend build output without requiring Vite development tooling at runtime

#### Scenario: Serve frontend
- **WHEN** the frontend container receives a browser request for the application root
- **THEN** it SHALL return the Cagnard web application entry point

### Requirement: Production API routing
Cagnard SHALL document and provide deployment defaults that make frontend `/api` requests reach the backend service in production deployments.

#### Scenario: Frontend calls backend API
- **WHEN** the deployed frontend issues a request under `/api`
- **THEN** the deployment SHALL route the request to the backend service without requiring users to manually edit built frontend assets

### Requirement: Helm chart
Cagnard SHALL provide a Helm chart that deploys the backend and frontend images with configurable runtime settings and first-class example values for supported runnable example combinations.

#### Scenario: Render chart with defaults
- **WHEN** an operator renders the Helm chart with default values
- **THEN** the chart SHALL produce Kubernetes manifests for backend and frontend workloads, services, configuration mounts, and health probes

#### Scenario: Override deployment values
- **WHEN** an operator supplies Helm values for image repositories, tags, ingress, resources, replicas, or configuration source
- **THEN** the rendered manifests SHALL reflect those values

#### Scenario: Render runnable example values
- **WHEN** an operator renders the Helm chart with a runnable example values file
- **THEN** the chart SHALL produce Kubernetes manifests that match the provider and auth combination documented for that example

### Requirement: Deployment health checks
Cagnard SHALL expose and configure health checks suitable for container and Kubernetes deployments.

#### Scenario: Backend readiness
- **WHEN** Kubernetes checks backend readiness
- **THEN** the backend workload SHALL use an HTTP readiness probe against the backend health endpoint

#### Scenario: Frontend readiness
- **WHEN** Kubernetes checks frontend readiness
- **THEN** the frontend workload SHALL use an HTTP readiness probe that confirms the static application can be served

### Requirement: Packaging documentation
Cagnard SHALL document released Docker images, local source builds, Mocker validation, Docker Compose runnable examples, published OCI Helm installation, example Helm values, configuration mounting, and deployment limitations through task-oriented guides.

#### Scenario: Read deployment documentation
- **WHEN** an operator reads the deployment documentation
- **THEN** it SHALL distinguish the shortest released-artifact path from source-build and contributor workflows, and explain configuration, secrets, ingress or API routing, health checks, and known limitations

#### Scenario: Read example maintenance guidance
- **WHEN** a contributor reads the deployment or examples documentation
- **THEN** it SHALL state that new provider and auth-method changes must add or update relevant Docker Compose examples and Helm values when startup configuration changes

#### Scenario: Install published Helm chart
- **WHEN** an operator follows the Helm getting-started guide
- **THEN** the guide SHALL install Cagnard from the published OCI chart repository using a matching chart version and maintained starter values without requiring a local chart build

#### Scenario: Configure production secrets
- **WHEN** an operator adapts the Helm starter deployment for production
- **THEN** the documentation SHALL direct secret-bearing HOCON and credentials to Kubernetes Secrets, mounted secret sources, or external secret management instead of inline public values
