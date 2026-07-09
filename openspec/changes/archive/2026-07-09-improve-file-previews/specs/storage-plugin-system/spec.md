## MODIFIED Requirements

### Requirement: Large-file content access capabilities
Storage plugins SHALL expose content access capabilities that let Cagnard distinguish full buffered reads, bounded text reads, range reads, stream reads, and provider-native preview or open behavior.

#### Scenario: Full buffered read only
- **WHEN** a storage plugin supports only full buffered download for content access
- **THEN** Cagnard SHALL enforce configured object size limits before routing files to openers that require complete content

#### Scenario: Range read supported
- **WHEN** a storage plugin supports byte-range reads for an entry
- **THEN** Cagnard SHALL expose that capability to opener plugins that can operate through partial content access

#### Scenario: Stream read supported
- **WHEN** a storage plugin supports streaming content delivery
- **THEN** Cagnard SHALL expose that capability to opener plugins and transfer flows that can avoid full in-memory buffering

#### Scenario: Deliver declared range reads
- **WHEN** a storage plugin declares range read as supported for an entry
- **THEN** Cagnard SHALL be able to serve a byte-range request for that entry's content through the storage content access API, not merely report the capability as a flag

## ADDED Requirements

### Requirement: Change notification capability
Storage plugins SHALL declare whether they support change notification for a given entry, and MAY implement it through native provider push or backend-side polling.

#### Scenario: Native change notification supported
- **WHEN** a storage plugin can observe content changes to a file as they happen
- **THEN** Cagnard SHALL report change notification as supported for that plugin

#### Scenario: Change notification degraded
- **WHEN** a storage plugin has no native mechanism to observe content changes and instead polls for them
- **THEN** Cagnard SHALL report change notification as degraded for that plugin so the client-visible latency characteristics are understood as approximate

#### Scenario: Change notification unsupported
- **WHEN** a storage plugin cannot observe or approximate content changes at all
- **THEN** Cagnard SHALL report change notification as unsupported for that plugin
