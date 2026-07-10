## ADDED Requirements

### Requirement: Release-first Docker getting started
Cagnard SHALL provide a Docker Compose getting-started path that runs released frontend and backend images without requiring local Go, Node.js, pnpm, or Mocker toolchains.

#### Scenario: Start released local example
- **WHEN** a user follows the default local-filesystem Docker getting-started commands with Docker and Compose available
- **THEN** Compose SHALL obtain compatible released Cagnard images, start the frontend and backend, mount complete demo configuration and storage, and expose the documented browser URL

#### Scenario: Build example from source
- **WHEN** a contributor wants to validate local application changes with the same example
- **THEN** the example SHALL document an explicit source-build override or equivalent development command without changing the release-first default path

### Requirement: Example contract currency
Runnable examples SHALL stay compatible with the current backend configuration, UI plugin manifest, image, and Helm chart contracts.

#### Scenario: Validate current plugin declarations
- **WHEN** an example declares UI plugins or opener views
- **THEN** every required manifest field SHALL be present and accepted by the current backend and frontend contract

#### Scenario: Use matching component versions
- **WHEN** an example selects released frontend and backend images
- **THEN** the example SHALL default both components to compatible versions and expose a documented version override

#### Scenario: Follow rewritten documentation
- **WHEN** a user follows a getting-started guide that references an example
- **THEN** the example path, environment file, command, ports, credentials, and cleanup instructions SHALL match the repository artifacts
