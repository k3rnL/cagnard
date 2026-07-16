## MODIFIED Requirements

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
