## Purpose

Defines provider-agnostic copy and move behavior between storage implementations.

## Requirements

### Requirement: Provider-agnostic transfer model
Cagnard SHALL transfer files, directories, and objects between storage implementations using source and destination storage references rather than provider-specific transfer flows, including transfers initiated from the browser pasteboard.

#### Scenario: Transfer between different providers
- **WHEN** the user copies an object from S3-compatible storage to Unix filesystem storage
- **THEN** Cagnard SHALL plan the operation through the source read capability and destination write capability

#### Scenario: Transfer between accounts of same provider
- **WHEN** the user copies a file between two accounts for the same provider family
- **THEN** Cagnard SHALL treat the accounts as distinct source and destination contexts

#### Scenario: Pasteboard transfer
- **WHEN** the user pastes a staged item into a destination root from another provider
- **THEN** Cagnard SHALL execute the transfer through provider-neutral source and destination references

#### Scenario: Recursive directory transfer
- **WHEN** the user pastes a staged directory into a destination root from another provider
- **THEN** Cagnard SHALL plan recursive child listing, destination directory creation, and child file transfer through provider-neutral capabilities

### Requirement: Transfer capability negotiation
Cagnard SHALL verify list, read, write, create-directory, overwrite, metadata, and delete capabilities before starting a copy or move transfer.

#### Scenario: Block unsupported destination
- **WHEN** the destination provider does not support upload or write stream access
- **THEN** Cagnard SHALL block the transfer before reading from the source

#### Scenario: Plan degraded move
- **WHEN** the user requests move and the providers only support copy plus delete semantics
- **THEN** Cagnard SHALL identify the operation as a degraded move and require source delete capability before completing it as a move

#### Scenario: Block move without delete
- **WHEN** a pasteboard move crosses providers and the source entry does not support delete
- **THEN** Cagnard SHALL block the move before writing the destination

#### Scenario: Block directory transfer without listing
- **WHEN** a directory source cannot be listed recursively
- **THEN** Cagnard SHALL block that directory transfer before writing destination content

### Requirement: Copy and move semantics
Cagnard SHALL define copy as creating a destination entry while preserving the source entry and move as creating a destination entry then deleting the source only after destination success is verified.

#### Scenario: Copy preserves source
- **WHEN** a copy transfer completes
- **THEN** Cagnard SHALL leave the source entry unchanged unless the provider reports a source-side mutation as an explicit limitation

#### Scenario: Move deletes after verified destination
- **WHEN** a move transfer uploads the destination successfully
- **THEN** Cagnard SHALL delete the source only after the destination write is verified according to the destination plugin's verification capability

#### Scenario: Delete failure after move copy
- **WHEN** a move transfer copies the destination successfully but source deletion fails
- **THEN** Cagnard SHALL report partial success and SHALL NOT remove the destination copy automatically

### Requirement: Transfer planning strategies
Cagnard SHALL choose the safest available transfer strategy from provider-native copy, server-side copy, recursive planning, ranged streaming, multipart transfer, or controlled backend fallback.

#### Scenario: Use optimized provider path
- **WHEN** source and destination are compatible with a provider-native or server-side copy operation
- **THEN** Cagnard SHALL use that operation when it preserves the requested semantics and permissions allow it

#### Scenario: Fall back to backend-mediated transfer
- **WHEN** no safe provider-native transfer strategy is available
- **THEN** Cagnard SHALL transfer through a controlled backend-mediated read and write path using source download/read and destination upload/write capabilities

#### Scenario: Plan recursive fallback
- **WHEN** a directory transfer uses backend-mediated fallback
- **THEN** Cagnard SHALL create the destination tree and transfer child files without deleting any source entries until the requested move semantics allow it

#### Scenario: Enforce buffered transfer limit
- **WHEN** the available fallback strategy requires buffering and the object exceeds the configured transfer limit
- **THEN** Cagnard SHALL fail the item before reading source content and report the configured limit

### Requirement: Metadata preservation policy
Cagnard SHALL preserve metadata during transfers when supported and SHALL report metadata fields that are changed, dropped, transformed, or unavailable.

#### Scenario: Preserve supported metadata
- **WHEN** both source and destination support MIME type and encryption metadata
- **THEN** Cagnard SHALL preserve those fields or report why preservation failed

#### Scenario: Report unsupported metadata preservation
- **WHEN** the source exposes retention metadata and the destination cannot represent retention
- **THEN** Cagnard SHALL complete only the content transfer and report the retention metadata as not preserved

### Requirement: Conflict handling
Cagnard SHALL require an explicit conflict policy before overwriting, keeping both, renaming, skipping, or versioning an existing destination entry.

#### Scenario: Destination exists
- **WHEN** a transfer destination already contains an entry at the target path
- **THEN** Cagnard SHALL apply the selected conflict policy before writing the destination

#### Scenario: No conflict policy
- **WHEN** a destination conflict is detected and no conflict policy has been selected
- **THEN** Cagnard SHALL pause or fail the transfer without overwriting the existing entry

#### Scenario: Batch paste conflict policy
- **WHEN** multiple pasteboard items are pasted as one batch
- **THEN** Cagnard SHALL apply the chosen conflict policy consistently to all destination conflicts in that batch

#### Scenario: Keep both
- **WHEN** the user chooses Keep Both for a conflict
- **THEN** Cagnard SHALL create the incoming item under a predictable non-conflicting name when the destination supports it

#### Scenario: Replace requires explicit choice
- **WHEN** the user has not explicitly chosen Replace
- **THEN** Cagnard SHALL NOT overwrite an existing destination entry

### Requirement: Transfer progress and recovery
Cagnard SHALL expose transfer progress, cancellation, retry, and resumability according to the capabilities of the participating providers.

#### Scenario: Show transfer progress
- **WHEN** a transfer starts
- **THEN** Cagnard SHALL report progress using bytes, item counts, current phase, and provider-specific waiting states when available

#### Scenario: Retry transient provider error
- **WHEN** a provider reports a transient error during transfer
- **THEN** Cagnard SHALL retry according to the transfer policy and provider rate-limit constraints

#### Scenario: Cancel transfer
- **WHEN** the user cancels an active transfer
- **THEN** Cagnard SHALL stop further reads and writes and report any partial destination state that remains

### Requirement: Transfer auditability
Cagnard SHALL record transfer intent, source, destination, account context, selected policies, result, and provider diagnostics for audit review.

#### Scenario: Audit completed transfer
- **WHEN** a cross-provider transfer completes
- **THEN** Cagnard SHALL record the source provider, destination provider, accounts, paths, byte counts, policies, and final result

#### Scenario: Audit failed transfer
- **WHEN** a transfer fails
- **THEN** Cagnard SHALL record the failure phase and safe diagnostic details without exposing secrets
