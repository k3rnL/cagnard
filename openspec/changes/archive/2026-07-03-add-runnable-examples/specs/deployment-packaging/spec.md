## MODIFIED Requirements

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

### Requirement: Packaging documentation
Cagnard SHALL document Docker image builds, local Mocker validation, Docker Compose runnable examples, Helm installation, example Helm values, configuration mounting, and deployment limitations.

#### Scenario: Read deployment documentation
- **WHEN** an operator reads the deployment documentation
- **THEN** it SHALL describe how to build images, run the chart, provide HOCON configuration, run runnable Docker Compose examples, use example Helm values, and identify known limitations

#### Scenario: Read example maintenance guidance
- **WHEN** a contributor reads the deployment or examples documentation
- **THEN** it SHALL state that new provider and auth-method changes must add or update relevant Docker Compose examples and Helm values when startup configuration changes
