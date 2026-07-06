## MODIFIED Requirements

### Requirement: Backend container image
Cagnard SHALL package the Go backend as the production backend container image.

#### Scenario: Build Go backend image
- **WHEN** CI or an operator builds the backend image
- **THEN** the final image SHALL contain the Go backend binary and runtime assets required to start Cagnard without sbt, Scala, or a JVM

#### Scenario: Run with external config
- **WHEN** the Go backend container starts with `CAGNARD_CONFIG` pointing to a mounted HOCON file
- **THEN** it SHALL load that configuration and serve the same backend API as the previous container image

### Requirement: Helm chart
Cagnard SHALL update Helm chart defaults and examples to deploy the Go backend image without changing user-facing configuration values unnecessarily.

#### Scenario: Render chart after rewrite
- **WHEN** an operator renders the Helm chart with default values
- **THEN** the backend workload SHALL run the Go backend image and preserve config mounts, probes, services, and frontend API routing

#### Scenario: Preserve values compatibility
- **WHEN** existing example Helm values configure providers, auth, images, ingress, resources, replicas, or config sources
- **THEN** the chart SHALL keep those values compatible unless the change is explicitly documented
