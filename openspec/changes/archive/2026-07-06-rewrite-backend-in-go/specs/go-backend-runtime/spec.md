## ADDED Requirements

### Requirement: Go backend runtime
Cagnard SHALL provide a Go backend runtime that replaces the Scala backend as the production server while preserving the existing backend behavior unless another spec explicitly changes it.

#### Scenario: Start Go backend
- **WHEN** an operator starts the Go backend with a valid Cagnard configuration
- **THEN** the backend SHALL expose the same configured API surface, providers, authentication modes, storage roots, and UI plugin declarations as the Scala reference backend

#### Scenario: Serve HTTP routes
- **WHEN** the Go backend receives a browser or API request for an existing Cagnard backend route
- **THEN** it SHALL route the request through Go handlers that preserve the current request and response contract

#### Scenario: Reject unsupported compatibility gap
- **WHEN** a current Scala backend feature is not implemented in the Go backend
- **THEN** the Go backend SHALL fail the related test or startup validation rather than silently serving degraded behavior as if it were compatible

### Requirement: Go service lifecycle
The Go backend SHALL provide production service lifecycle behavior suitable for local development, containers, and Kubernetes.

#### Scenario: Graceful shutdown
- **WHEN** the Go backend receives a termination signal
- **THEN** it SHALL stop accepting new requests, allow in-flight HTTP requests and transfer tasks to finish or cancel within a configured grace period, and exit with an explicit status

#### Scenario: Health endpoint
- **WHEN** deployment health checks call the backend health endpoint
- **THEN** the Go backend SHALL report readiness and liveness using the same endpoint contract expected by existing deployment manifests

#### Scenario: Structured diagnostics
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

#### Scenario: Version reporting
- **WHEN** release packaging injects a Cagnard version into the backend build
- **THEN** the Go backend SHALL expose or log that version through the documented runtime diagnostics

### Requirement: Go test parity
Cagnard SHALL provide Go tests that cover the behavior previously protected by Scala backend tests before removing the Scala backend as the default runtime.

#### Scenario: Port backend unit coverage
- **WHEN** Scala backend tests cover configuration, authentication, storage providers, or transfer jobs
- **THEN** equivalent Go tests SHALL be added or an API-level compatibility test SHALL cover the same behavior

#### Scenario: Run backend tests locally
- **WHEN** a contributor runs the documented backend test command
- **THEN** Go backend tests SHALL execute without requiring external providers unless the test is explicitly marked opt-in
