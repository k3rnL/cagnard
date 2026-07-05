## MODIFIED Requirements

### Requirement: Provider-agnostic transfer model
Cagnard SHALL transfer files, directories, and objects between storage implementations using source and destination storage references rather than provider-specific transfer flows, including transfers initiated from the browser pasteboard.

#### Scenario: Transfer between different providers
- **WHEN** the user copies an object from S3-compatible storage to Unix filesystem storage
- **THEN** Cagnard SHALL plan the operation through the source read capability and destination write capability

#### Scenario: Transfer through job
- **WHEN** the user starts a cross-provider copy or move
- **THEN** Cagnard SHALL create a transfer job and return a job reference instead of requiring the full transfer to finish inside the initiating HTTP request

#### Scenario: Recursive directory transfer
- **WHEN** the user pastes a staged directory into a destination root from another provider
- **THEN** Cagnard SHALL plan recursive child listing, destination directory creation, and child file transfer as job tasks through provider-neutral capabilities

### Requirement: Transfer planning strategies
Cagnard SHALL choose the safest available transfer strategy from provider-native copy, server-side copy, recursive planning, streaming backend transfer, multipart transfer, or bounded buffered fallback.

#### Scenario: Use optimized provider path
- **WHEN** source and destination are compatible with a provider-native or server-side copy operation
- **THEN** Cagnard SHALL use that operation when it preserves the requested semantics and permissions allow it

#### Scenario: Fall back to streaming transfer
- **WHEN** no safe provider-native transfer strategy is available and both providers expose compatible streaming capabilities
- **THEN** Cagnard SHALL transfer through a controlled backend-mediated streaming read and write path

#### Scenario: Use bounded fallback only after preflight
- **WHEN** no safe streaming or multipart strategy is available
- **THEN** Cagnard SHALL use buffered fallback only after preflight verifies the source is within the configured buffered fallback limit

### Requirement: Copy and move semantics
Cagnard SHALL define copy as creating a destination entry while preserving the source entry and move as creating a destination entry then deleting the source only after destination success is verified.

#### Scenario: Move waits for verification
- **WHEN** a move transfer writes the destination
- **THEN** Cagnard SHALL verify the destination according to available provider capabilities before deleting the source

#### Scenario: Delete failure after move copy
- **WHEN** a move transfer copies and verifies the destination successfully but source deletion fails
- **THEN** Cagnard SHALL report partial success, keep the destination copy, and keep the job retryable for the source-delete phase when safe

### Requirement: Transfer progress and recovery
Cagnard SHALL expose transfer progress, cancellation, retry, and resumability according to the capabilities of the participating providers.

#### Scenario: Show job progress
- **WHEN** a transfer job starts
- **THEN** Cagnard SHALL report job progress using task phases, bytes, item counts, current source and destination context, and provider-specific waiting states when available

#### Scenario: Retry transient provider error
- **WHEN** a provider reports a transient error during transfer
- **THEN** Cagnard SHALL retry according to the transfer policy and provider rate-limit constraints without duplicating completed verified destination data

#### Scenario: Cancel transfer
- **WHEN** the user cancels an active transfer
- **THEN** Cagnard SHALL stop further reads and writes, request provider cancellation or cleanup where available, and report any partial destination state that remains
