# ci-release-automation Specification

## Purpose
TBD - created by archiving change add-docker-helm-github-actions. Update Purpose after archive.
## Requirements
### Requirement: Pull request validation workflow
Cagnard SHALL provide a GitHub Actions workflow that validates backend, frontend, Docker image, and Helm changes before merge.

#### Scenario: Validate pull request
- **WHEN** a pull request updates application, packaging, chart, or workflow files
- **THEN** GitHub Actions SHALL run backend tests, frontend typecheck/build, Docker image build checks, and Helm chart validation

#### Scenario: Report failed validation
- **WHEN** a validation step fails
- **THEN** the workflow SHALL fail and expose the failing step in the GitHub Actions run

### Requirement: Push validation workflow
Cagnard SHALL run the validation workflow on relevant pushes to the default branch.

#### Scenario: Validate default branch push
- **WHEN** changes are pushed to the default branch
- **THEN** GitHub Actions SHALL run the same validation checks used for pull requests

### Requirement: Container publishing workflow
Cagnard SHALL provide a GitHub Actions workflow that can publish backend and frontend container images to a configured registry.

#### Scenario: Publish tagged images
- **WHEN** a release tag or manual publishing event is triggered with registry access configured
- **THEN** the workflow SHALL use Docker to build and push both backend and frontend images with deterministic tags

#### Scenario: Missing registry credentials
- **WHEN** required registry credentials or permissions are unavailable
- **THEN** the publishing workflow SHALL fail without exposing secret values in logs

### Requirement: CI documentation
Cagnard SHALL document workflow triggers, required secrets or permissions, image tagging, and local equivalents for CI checks.

#### Scenario: Read CI documentation
- **WHEN** a maintainer reads the CI documentation
- **THEN** it SHALL describe how validation runs, how image publishing is triggered, and what registry configuration is required

