## MODIFIED Requirements

### Requirement: Provider-agnostic transfer model
Cagnard SHALL preserve provider-neutral copy and move behavior in the Go backend.

#### Scenario: Transfer between providers
- **WHEN** a pasteboard transfer copies or moves an entry between different storage providers
- **THEN** the Go backend SHALL plan the operation through source and destination provider capabilities rather than frontend download and upload

#### Scenario: Recursive directory transfer
- **WHEN** a pasteboard transfer includes a directory or object-store prefix
- **THEN** the Go backend SHALL recursively list children, create destination directories or prefixes, and transfer child files using provider-neutral semantics

### Requirement: Transfer job compatibility
Cagnard SHALL preserve the current transfer job API and in-memory execution behavior in the Go backend.

#### Scenario: Start transfer job
- **WHEN** the frontend calls the transfer job creation endpoint
- **THEN** the Go backend SHALL return a job id, status, task list, progress counters, destination reference, conflict policy, and results using the same response shape

#### Scenario: List and inspect jobs
- **WHEN** the frontend lists or inspects transfer jobs
- **THEN** the Go backend SHALL return recent in-memory jobs for the authenticated user only

#### Scenario: Cancel job
- **WHEN** the user cancels a queued or running transfer job
- **THEN** the Go backend SHALL stop future transfer work and report cancellation or partial state using the existing job model

### Requirement: Conflict policy parity
Cagnard SHALL preserve transfer conflict handling in the Go backend.

#### Scenario: Nested conflict preflight
- **WHEN** a fail-policy directory transfer would conflict in a nested child path
- **THEN** the Go backend SHALL block the job before writing destination content and return a conflict result that the frontend can use to ask for a policy

#### Scenario: Keep both
- **WHEN** the conflict policy is keep-both
- **THEN** the Go backend SHALL choose predictable non-conflicting names compatible with the Scala reference backend

#### Scenario: Replace directory
- **WHEN** the conflict policy is replace and the target is a directory-like entry
- **THEN** the Go backend SHALL delete the existing destination tree through provider delete semantics before writing the replacement

### Requirement: Safe move semantics
Cagnard SHALL preserve safe move behavior in the Go backend.

#### Scenario: Delete source after destination success
- **WHEN** a move transfer writes and verifies the destination
- **THEN** the Go backend SHALL delete the source only after destination success

#### Scenario: Report partial move
- **WHEN** destination copy succeeds but source deletion fails
- **THEN** the Go backend SHALL report partial success and SHALL NOT remove the destination copy automatically
