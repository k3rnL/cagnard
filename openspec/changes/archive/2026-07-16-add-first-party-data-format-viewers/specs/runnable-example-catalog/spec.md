## MODIFIED Requirements

### Requirement: Example contract currency
Runnable examples SHALL stay compatible with the current backend configuration, first-party frontend format contract, image, and Helm chart contracts.

#### Scenario: Avoid removed UI plugin declarations
- **WHEN** an example is validated after the frontend plugin contract is removed
- **THEN** its HOCON and Helm values SHALL NOT declare `uiPlugins` or configured opener views

#### Scenario: Include structured-data fixtures
- **WHEN** a runnable example is used to validate supported structured-data viewers
- **THEN** it SHALL include or deterministically generate safe representative fixtures for the formats exercised by that example

#### Scenario: Use matching component versions
- **WHEN** an example selects released frontend and backend images
- **THEN** the example SHALL default both components to compatible versions and expose a documented version override

#### Scenario: Follow rewritten documentation
- **WHEN** a user follows a getting-started guide that references an example
- **THEN** the example path, environment file, command, ports, credentials, cleanup instructions, and available sample files SHALL match the repository artifacts
