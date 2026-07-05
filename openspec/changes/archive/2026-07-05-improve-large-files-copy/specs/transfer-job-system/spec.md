## ADDED Requirements

### Requirement: Transfer job lifecycle
Cagnard SHALL represent long-running copy and move operations as transfer jobs composed of one or more transfer tasks.

#### Scenario: Create transfer job
- **WHEN** the user starts a copy or move from the pasteboard
- **THEN** Cagnard SHALL create a transfer job with a stable job id, source references, destination reference, conflict policy, requested operation, and initial task plan

#### Scenario: Track job status
- **WHEN** a transfer job is planned, queued, running, completed, failed, canceled, or partially complete
- **THEN** Cagnard SHALL expose that status through the transfer job API and browser UI

#### Scenario: Split directory job into tasks
- **WHEN** a transfer job includes a directory
- **THEN** Cagnard SHALL represent child file and directory work as tasks or child tasks with enough hierarchy to report per-child results

### Requirement: Transfer task phases
Cagnard SHALL track transfer task phases using normalized phase names that are independent from provider-specific APIs.

#### Scenario: Report task phase
- **WHEN** a task moves through planning, reading, writing, verifying, deleting-source, cleanup, completed, failed, canceled, or partial states
- **THEN** Cagnard SHALL expose the current phase and safe phase-specific message

#### Scenario: Report progress counters
- **WHEN** a task transfers bytes or directory children
- **THEN** Cagnard SHALL report known byte counts, transferred bytes, item counts, completed item counts, and unknown totals explicitly when totals are unavailable

### Requirement: Transfer job actions
Cagnard SHALL support safe user actions for canceling, retrying, and inspecting transfer jobs.

#### Scenario: Cancel running job
- **WHEN** the user cancels a running transfer job
- **THEN** Cagnard SHALL stop scheduling new tasks, request cancellation for active provider operations when supported, and report remaining partial destination state

#### Scenario: Retry failed task
- **WHEN** the user retries a failed or partial transfer task
- **THEN** Cagnard SHALL reuse the original source, destination, operation, and conflict policy unless the user explicitly changes them

#### Scenario: Inspect failure
- **WHEN** a transfer task fails
- **THEN** Cagnard SHALL expose the failed phase, source context, target context, canonical error category, safe provider diagnostic, and available recovery actions

### Requirement: Transfer job retention
Cagnard SHALL retain completed transfer job summaries long enough for users to understand recent copy and move outcomes without requiring permanent backend-local database state.

#### Scenario: Retain in-memory job history
- **WHEN** the backend runs without external job persistence
- **THEN** Cagnard MAY retain job state in memory for the configured retention window and SHALL report that jobs are lost on backend restart

#### Scenario: Use external job store
- **WHEN** an external job persistence provider is configured
- **THEN** Cagnard SHALL recover incomplete and recent transfer jobs according to that provider's consistency guarantees
