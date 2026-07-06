## MODIFIED Requirements

### Requirement: Runnable examples
Cagnard SHALL keep existing runnable examples working with the Go backend.

#### Scenario: Run local filesystem static example
- **WHEN** an operator starts the local filesystem static-user example
- **THEN** the example SHALL run the Go backend and frontend with the same login credentials and storage roots documented before the rewrite

#### Scenario: Run S3 MinIO static example
- **WHEN** an operator starts the S3/MinIO static-user example
- **THEN** the example SHALL run MinIO, the Go backend, and the frontend using the same user-facing configuration and seeded sample files

#### Scenario: Run combined local and S3 example
- **WHEN** an operator starts an example combining local filesystem and S3 providers
- **THEN** copy, move, upload, download, browsing, and transfer jobs SHALL work across providers through the Go backend

### Requirement: Example maintenance
Cagnard SHALL update example documentation and validation commands for the Go backend.

#### Scenario: Validate examples
- **WHEN** CI or a contributor runs example validation
- **THEN** the validation SHALL build or reference the Go backend image and verify Compose and Helm example values still render or start correctly

#### Scenario: Document backend command changes
- **WHEN** contributors read example docs
- **THEN** they SHALL see Go backend commands instead of Scala/sbt commands where runtime behavior changed
