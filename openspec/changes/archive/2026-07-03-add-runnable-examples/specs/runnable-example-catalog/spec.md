## ADDED Requirements

### Requirement: Runnable example catalog
Cagnard SHALL provide a runnable examples catalog that gives users complete starter setups from simple local storage to combined provider/auth deployments.

#### Scenario: Discover available examples
- **WHEN** a user opens the examples catalog documentation
- **THEN** it SHALL list each runnable example, its storage providers, auth method, required local services, exposed ports, and intended use case

#### Scenario: Follow examples from simple to complex
- **WHEN** a user evaluates the catalog order
- **THEN** examples SHALL progress from the simplest local filesystem/static-user setup to S3/MinIO and combined provider setups

### Requirement: Local filesystem static-user example
Cagnard SHALL provide a local filesystem example that starts the frontend and backend with static users and Unix filesystem storage.

#### Scenario: Start local filesystem example
- **WHEN** a user runs the local filesystem example with Docker Compose
- **THEN** the example SHALL start both Cagnard frontend and backend services using a complete backend HOCON configuration

#### Scenario: Browse local sample storage
- **WHEN** a demo user logs in to the local filesystem example
- **THEN** the user SHALL be able to browse sample filesystem-backed home or global storage exposed by the example configuration

### Requirement: S3 MinIO static-user example
Cagnard SHALL provide an S3-compatible example that starts the frontend, backend, MinIO, and MinIO initialization with static users.

#### Scenario: Start S3 MinIO example
- **WHEN** a user runs the S3 MinIO example with Docker Compose
- **THEN** the example SHALL start Cagnard frontend, Cagnard backend, MinIO, and a MinIO initialization step

#### Scenario: Seed generated S3 sample files
- **WHEN** the S3 MinIO example initializes
- **THEN** it SHALL create the configured bucket and prefix and seed generated sample files for browsing

#### Scenario: Browse S3 sample storage
- **WHEN** a demo user logs in after MinIO initialization completes
- **THEN** the user SHALL be able to browse S3-backed objects through Cagnard

### Requirement: Combined provider example
Cagnard SHALL provide a combined example that exposes filesystem storage and S3/MinIO storage in the same running browser.

#### Scenario: Start combined provider example
- **WHEN** a user runs the combined provider example with Docker Compose
- **THEN** the example SHALL start Cagnard frontend, Cagnard backend, MinIO, and initialization services needed for all configured storage providers

#### Scenario: Browse multiple provider roots
- **WHEN** a demo user logs in to the combined provider example
- **THEN** the user SHALL see both filesystem-backed and S3-backed storage roots according to the example configuration

### Requirement: Example artifact completeness
Each runnable example SHALL include all local files needed to understand and start that example without assembling unrelated snippets by hand.

#### Scenario: Inspect runnable example directory
- **WHEN** a user opens a runnable example directory
- **THEN** it SHALL contain a README, Docker Compose file, backend HOCON configuration or template, environment example, and any provider-specific seed or initialization files needed by that example

#### Scenario: Avoid Helmfile wrappers
- **WHEN** a user inspects the first implementation of runnable examples
- **THEN** it SHALL provide pure Helm values for Kubernetes usage and SHALL NOT require Helmfile wrapper files

### Requirement: Secret-safe examples
Cagnard runnable examples SHALL use only local demo credentials or explicit placeholders and SHALL NOT embed real cloud credentials.

#### Scenario: Inspect demo credentials
- **WHEN** a user reads an example configuration or environment file
- **THEN** all included credentials SHALL be clearly scoped to local demo services or represented as placeholders or environment substitutions

#### Scenario: Use MinIO credentials
- **WHEN** an S3/MinIO example configures S3 access keys
- **THEN** those keys SHALL be demo credentials that are valid only for the local MinIO service in that example

### Requirement: Provider and auth example maintenance
Cagnard SHALL require future provider and auth-method changes to update runnable examples when the change affects how users start or configure the system.

#### Scenario: Add storage provider
- **WHEN** a change adds a new storage provider
- **THEN** it SHALL add or update at least one relevant runnable Docker Compose example and matching Helm values when the provider can be configured in Kubernetes

#### Scenario: Add auth method
- **WHEN** a change adds a new authentication method
- **THEN** it SHALL add or update a simple runnable example and at least one relevant provider combination example

### Requirement: Example validation
Cagnard SHALL provide validation for runnable example configuration and deployment artifacts.

#### Scenario: Validate example HOCON
- **WHEN** example validation runs
- **THEN** it SHALL parse or load each runnable example backend HOCON configuration with the backend configuration loader

#### Scenario: Validate Compose examples
- **WHEN** example validation runs
- **THEN** it SHALL structurally validate each runnable example Docker Compose file

#### Scenario: Validate Helm example values
- **WHEN** example validation runs
- **THEN** it SHALL render the Helm chart with each runnable example values file
