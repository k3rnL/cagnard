## ADDED Requirements

### Requirement: HTTP API compatibility
The Go backend SHALL preserve the request methods, paths, query parameters, request bodies, response bodies, status codes, cookies, and raw content behavior currently consumed by the frontend and examples.

#### Scenario: Preserve JSON APIs
- **WHEN** the frontend calls an existing JSON API endpoint
- **THEN** the Go backend SHALL return JSON fields with the same names, types, and semantics as the Scala reference backend

#### Scenario: Preserve raw content APIs
- **WHEN** a client downloads file content through the storage content endpoint
- **THEN** the Go backend SHALL return raw bytes with safe content headers rather than JSON-encoding the file content

#### Scenario: Preserve upload APIs
- **WHEN** a client uploads raw content to the storage content endpoint
- **THEN** the Go backend SHALL accept the same method, query parameters, overwrite behavior, request body shape, and response model as the Scala reference backend

### Requirement: API compatibility test harness
Cagnard SHALL provide compatibility tests or fixtures that compare the Go backend against the Scala reference behavior for critical browser workflows.

#### Scenario: Compare route contracts
- **WHEN** compatibility tests run against the Go backend
- **THEN** they SHALL exercise authentication, navigation, listing, mutation, content, transfer job, and UI plugin routes with representative fixtures

#### Scenario: Detect response drift
- **WHEN** the Go backend changes a response shape used by the frontend
- **THEN** compatibility tests SHALL fail unless the corresponding OpenSpec capability and frontend client are intentionally updated

#### Scenario: Preserve error shape
- **WHEN** an operation fails due to validation, authorization, conflict, unsupported provider behavior, or missing storage entry
- **THEN** the Go backend SHALL return the same public error code and safe message shape expected by the frontend

### Requirement: Frontend compatibility
The Go rewrite SHALL keep the React frontend operational without requiring a frontend rewrite.

#### Scenario: Run browser against Go backend
- **WHEN** the frontend is configured to call the Go backend
- **THEN** login, browsing, opening files, upload/download, mutation actions, pasteboard transfer, and transfer queue behavior SHALL continue to work

#### Scenario: Preserve session handling
- **WHEN** the frontend receives unauthorized responses from protected routes
- **THEN** the responses SHALL trigger the same client-side session reset behavior as the Scala backend
