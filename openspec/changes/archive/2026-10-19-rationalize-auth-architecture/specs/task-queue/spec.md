## MODIFIED Requirements

### Requirement: Unique task identity
Cagnard SHALL represent each user-started long-running operation as one task with a stable task id for the lifetime of that operation.

#### Scenario: Create one transfer task
- **WHEN** the user starts a pasteboard copy or move operation
- **THEN** Cagnard SHALL create exactly one task id for that operation and SHALL use that id for all later progress, conflict, cancellation, completion, and failure updates

#### Scenario: Resume blocked transfer
- **WHEN** a transfer task is blocked by a conflict without prior storage effects and the owner provides a decision with current authentication and grants
- **THEN** Cagnard SHALL resume the existing task id rather than creating another visible task in the queue

#### Scenario: Reject stale task decision
- **WHEN** the UI submits a conflict or cancellation decision for an unknown, terminal, or stale task id
- **THEN** Cagnard SHALL reject the decision with a safe user-facing error and SHALL NOT create replacement work


### Requirement: Conflict-blocked task decisions
Cagnard SHALL model transfer conflicts as blocked task state instead of separate browser operations.

#### Scenario: Conflict in nested transfer item
- **WHEN** a recursive transfer finds a destination conflict in a subdirectory
- **THEN** Cagnard SHALL mark the original task as `blocked` and expose the conflicting source and destination item enough for the UI to ask for a decision

#### Scenario: Resolve conflict
- **WHEN** the owner chooses a conflict policy for an eligible blocked task with current authentication and grants
- **THEN** Cagnard SHALL apply that decision to the existing task and continue processing according to the selected policy

#### Scenario: Cancel conflict dialog
- **WHEN** the user cancels or dismisses the conflict decision without choosing a policy
- **THEN** Cagnard SHALL cancel the blocked task and report it as `canceled`


### Requirement: Task operation context
Cagnard SHALL expose operation-neutral task identity and operation-specific context and SHALL scope ownership to the canonical provider-qualified principal ID.

#### Scenario: Identify operation
- **WHEN** the UI lists a task
- **THEN** the task SHALL identify its operation as copy, move, delete, download, or upload and expose a user-facing summary

#### Scenario: Authorize task access
- **WHEN** a user lists, reads, resolves, cancels, streams, or clears a task
- **THEN** Cagnard SHALL require its canonical owner identity and return a safe not-found response to a different owner

#### Scenario: Use stable serialized identifiers
- **WHEN** a task or affected item is returned through the API
- **THEN** Cagnard SHALL return stable serialized identifiers without exposing runtime object identities

#### Scenario: Equal subject from another provider
- **WHEN** another authenticated provider or issuer supplies the same subject string as the task owner
- **THEN** Cagnard SHALL treat it as a different principal and SHALL NOT reveal or authorize the task

## ADDED Requirements

### Requirement: Bounded task execution authorization
Cagnard SHALL bind background execution to verified identity evidence and an absolute deadline no later than the initiating session expiry. New work and explicit continuation SHALL use centralized authorization. Raw session cookies and OIDC tokens SHALL NOT be task credentials.

#### Scenario: Authentication expires during a task
- **WHEN** the task's authentication deadline is reached
- **THEN** Cagnard SHALL stop scheduling new operations, cancel active contexts where supported, and report partial effects without claiming rollback

#### Scenario: Resume with fresh authentication
- **WHEN** an owner explicitly resolves an eligible blocked conflict after signing in again
- **THEN** Cagnard SHALL authorize the continuation against the current identity and policy before extending execution; transfers with prior effects SHALL require a new request for the remaining work, without replaying completed destructive steps

#### Scenario: Local logout while a task runs
- **WHEN** the owner clears the browser session through local logout
- **THEN** the UI SHALL clear private task state without claiming server-side revocation or task cancellation, and accepted execution SHALL remain bounded by its existing deadline

#### Scenario: Long-lived content stream
- **WHEN** a download or watch continues beyond its authentication deadline
- **THEN** Cagnard SHALL cancel the stream context and SHALL NOT start additional provider reads under the expired authorization
