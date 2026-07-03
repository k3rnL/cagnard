## ADDED Requirements

### Requirement: Backend container image
Cagnard SHALL provide a Docker-compatible build for the backend runtime that starts the Scala HTTP service without requiring developer tooling in the final runtime image.

#### Scenario: Build backend image
- **WHEN** an operator builds the backend image from the repository
- **THEN** the resulting image SHALL contain the compiled backend application and a minimal runtime needed to execute it

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
Cagnard SHALL provide a Helm chart that deploys the backend and frontend images with configurable runtime settings.

#### Scenario: Render chart with defaults
- **WHEN** an operator renders the Helm chart with default values
- **THEN** the chart SHALL produce Kubernetes manifests for backend and frontend workloads, services, configuration mounts, and health probes

#### Scenario: Override deployment values
- **WHEN** an operator supplies Helm values for image repositories, tags, ingress, resources, replicas, or configuration source
- **THEN** the rendered manifests SHALL reflect those values

### Requirement: Deployment health checks
Cagnard SHALL expose and configure health checks suitable for container and Kubernetes deployments.

#### Scenario: Backend readiness
- **WHEN** Kubernetes checks backend readiness
- **THEN** the backend workload SHALL use an HTTP readiness probe against the backend health endpoint

#### Scenario: Frontend readiness
- **WHEN** Kubernetes checks frontend readiness
- **THEN** the frontend workload SHALL use an HTTP readiness probe that confirms the static application can be served

### Requirement: Packaging documentation
Cagnard SHALL document Docker image builds, local Mocker validation, Helm installation, configuration mounting, and deployment limitations.

#### Scenario: Read deployment documentation
- **WHEN** an operator reads the deployment documentation
- **THEN** it SHALL describe how to build images, run the chart, provide HOCON configuration, and identify known limitations
