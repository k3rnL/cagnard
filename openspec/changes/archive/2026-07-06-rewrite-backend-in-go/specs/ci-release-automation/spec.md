## MODIFIED Requirements

### Requirement: Pull request validation workflow
Cagnard SHALL update validation workflows to test and build the Go backend.

#### Scenario: Validate Go backend change
- **WHEN** backend source, config, provider, transfer, packaging, or workflow files change
- **THEN** CI SHALL run Go backend tests and build checks in addition to frontend, example, Docker, and Helm validation

#### Scenario: Remove stale Scala-only validation
- **WHEN** the Go backend becomes the default runtime
- **THEN** CI SHALL NOT require sbt backend tests as the primary backend validation unless Scala compatibility tests are intentionally retained

### Requirement: Release artifact publishing workflow
Cagnard SHALL publish release artifacts using the Go backend image.

#### Scenario: Publish tagged Go backend image
- **WHEN** a version tag or manual publishing event is triggered
- **THEN** the publishing workflow SHALL build and push the Go backend container image with deterministic release tags

#### Scenario: Publish Helm chart after rewrite
- **WHEN** the release workflow packages the Helm chart
- **THEN** chart metadata and release notes SHALL reference the Go backend runtime and matching backend image
