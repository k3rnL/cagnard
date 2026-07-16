## MODIFIED Requirements

### Requirement: Large-file content access capabilities
Storage plugins SHALL expose content access capabilities that let Cagnard distinguish full buffered reads, bounded text reads, range reads, stream reads, and provider-native preview or open behavior.

#### Scenario: Full buffered read only
- **WHEN** a storage plugin supports only full buffered download for content access
- **THEN** Cagnard SHALL enforce configured object size limits before routing files to first-party openers that require complete content

#### Scenario: Range read supported
- **WHEN** a storage plugin supports byte-range reads for an entry
- **THEN** Cagnard SHALL expose that capability to first-party openers and format engines that can operate through partial content access

#### Scenario: Stream read supported
- **WHEN** a storage plugin supports streaming content delivery
- **THEN** Cagnard SHALL expose that capability to first-party openers and transfer flows that can avoid full in-memory buffering

#### Scenario: Deliver declared range reads
- **WHEN** a storage plugin declares range read as supported for an entry
- **THEN** Cagnard SHALL be able to serve an authorized byte-range request for that entry's content through the storage content access API, not merely report the capability as a flag

### Requirement: Write-back capability semantics
Storage plugins SHALL report whether an entry supports overwrite, create-new-version, append, metadata update, or export-only save flows.

#### Scenario: Direct overwrite supported
- **WHEN** a provider can replace an existing file atomically or safely enough for direct editing
- **THEN** Cagnard MAY allow a first-party editor to save changes through overwrite when user permissions allow it

#### Scenario: Versioned save supported
- **WHEN** a provider supports versioned writes or new-version creation
- **THEN** Cagnard MAY allow a first-party editor to save changes as a new version when the opener declares that strategy

#### Scenario: Write-back unsupported
- **WHEN** a provider or selected entry does not support safe write-back
- **THEN** Cagnard SHALL restrict editor-capable openers to read-only or export-only behavior
