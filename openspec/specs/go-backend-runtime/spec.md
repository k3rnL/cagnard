# go-backend-runtime Specification

## Purpose

Defines the Go backend runtime, service lifecycle, build output, and parity expectations for the production backend.

## Requirements

### Requirement: Go backend runtime
Cagnard SHALL provide a Go backend runtime as the production server while preserving existing backend behavior unless another spec explicitly changes it.

#### Scenario: Start Go backend
- **WHEN** an operator starts the Go backend with a valid Cagnard configuration
- **THEN** the backend SHALL expose the configured API surface, providers, authentication modes, storage roots, and UI plugin declarations

#### Scenario: Serve HTTP routes
- **WHEN** the Go backend receives a browser or API request for an existing Cagnard backend route
- **THEN** it SHALL route the request through Go handlers that preserve the documented request and response contract

#### Scenario: Reject unsupported compatibility gap
- **WHEN** a current backend feature is not implemented in the Go backend
- **THEN** the Go backend SHALL fail the related test or startup validation rather than silently serving degraded behavior as if it were compatible

### Requirement: Go service lifecycle
The Go backend SHALL provide production service lifecycle behavior suitable for local development, containers, and Kubernetes.

#### Scenario: Graceful shutdown
- **WHEN** the Go backend receives a termination signal
- **THEN** it SHALL stop accepting new requests, allow in-flight HTTP requests to drain through server shutdown, and exit with an explicit status

#### Scenario: Health endpoint
- **WHEN** deployment health checks call the backend health endpoint
- **THEN** the Go backend SHALL report readiness and liveness using the endpoint contract expected by deployment manifests

#### Scenario: Safe diagnostics
- **WHEN** startup, configuration, authentication, provider, or transfer failures occur
- **THEN** the Go backend SHALL log safe diagnostics without exposing credentials or session signing secrets

### Requirement: Go build output
Cagnard SHALL build the backend as a Go binary that can run without Go toolchain dependencies in the runtime environment.

#### Scenario: Build backend binary
- **WHEN** maintainers run the documented backend build command
- **THEN** the repository SHALL produce a runnable Go backend binary for the target platform

#### Scenario: Run without JVM
- **WHEN** the Go backend image or release artifact starts
- **THEN** it SHALL NOT require a JVM, sbt, Scala compiler, or Scala runtime distribution

### Requirement: Go test parity
Cagnard SHALL provide Go tests that cover configuration, authentication, storage providers, API compatibility, and transfer behavior before release.

#### Scenario: Port backend coverage
- **WHEN** backend behavior covers configuration, authentication, storage providers, or transfer jobs
- **THEN** equivalent Go tests or API-level compatibility tests SHALL cover the behavior

#### Scenario: Run backend tests locally
- **WHEN** a contributor runs the documented backend test command
- **THEN** Go backend tests SHALL execute without requiring external providers unless the test is explicitly marked opt-in
