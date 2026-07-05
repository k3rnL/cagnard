## ADDED Requirements

### Requirement: Streaming transfer path
Cagnard SHALL transfer large file content through streaming provider-neutral paths when the source and destination expose compatible stream capabilities.

#### Scenario: Stream without full buffering
- **WHEN** a source supports stream read and a destination supports stream write
- **THEN** Cagnard SHALL copy bytes between them without materializing the full object in backend memory

#### Scenario: Bound memory usage
- **WHEN** a streaming transfer is active
- **THEN** Cagnard SHALL keep memory use bounded by configured chunk, buffer, and concurrency settings rather than by total object size

#### Scenario: Report streaming progress
- **WHEN** a streaming transfer copies bytes
- **THEN** Cagnard SHALL update transfer task byte progress as chunks are written or acknowledged

### Requirement: Multipart and provider-native transfer
Cagnard SHALL use multipart or provider-native server-side transfer strategies when they are safer or more efficient than generic streaming.

#### Scenario: Use provider-native copy
- **WHEN** source and destination are compatible with a provider-native server-side copy that preserves requested semantics
- **THEN** Cagnard SHALL use that copy strategy without routing file bytes through the backend

#### Scenario: Use multipart upload
- **WHEN** the destination provider supports multipart upload and the object size exceeds the configured multipart threshold
- **THEN** Cagnard SHALL write the destination through multipart upload and track part completion in the transfer task

#### Scenario: Abort incomplete multipart upload
- **WHEN** a multipart transfer is canceled or fails before completion
- **THEN** Cagnard SHALL request provider cleanup for incomplete multipart state and report cleanup failure separately from transfer failure

### Requirement: Bounded fallback transfer
Cagnard SHALL use full buffered fallback only when no streaming, multipart, or provider-native strategy is available and the source size is within configured limits.

#### Scenario: Preflight fallback size
- **WHEN** a transfer plan would use buffered fallback
- **THEN** Cagnard SHALL check known source size against the configured buffered limit before reading source bytes

#### Scenario: Refuse oversized fallback
- **WHEN** the source is larger than the buffered fallback limit
- **THEN** Cagnard SHALL fail the task before reading content and report the missing streaming or multipart capability

### Requirement: Verification and cleanup
Cagnard SHALL verify destination writes before marking tasks successful or deleting move sources.

#### Scenario: Verify destination
- **WHEN** a destination write completes
- **THEN** Cagnard SHALL verify the destination using provider-supported metadata, checksum, size, version, etag, or stat semantics before declaring the task complete

#### Scenario: Delay source deletion
- **WHEN** a move task writes a destination
- **THEN** Cagnard SHALL delete the source only after destination verification succeeds and source delete authorization still passes

#### Scenario: Cleanup failed copy
- **WHEN** a copy or move task fails after creating partial destination state
- **THEN** Cagnard SHALL attempt configured cleanup when safe and SHALL report any remaining destination artifact
