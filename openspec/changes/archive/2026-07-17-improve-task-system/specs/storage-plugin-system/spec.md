## ADDED Requirements

### Requirement: Context-aware provider operations
Cagnard storage providers SHALL accept cancellation context for long-running recursive delete, stream read, and stream write operations and SHALL stop provider work promptly where the underlying service permits it.

#### Scenario: Cancel filesystem operation
- **WHEN** a filesystem delete, read, or write operation receives cancellation
- **THEN** the provider SHALL stop scheduling additional filesystem work, close open resources, and return a cancellation result with completed progress preserved

#### Scenario: Cancel S3 operation
- **WHEN** an S3 prefix delete, object read, or object write receives cancellation
- **THEN** the provider SHALL propagate cancellation to SDK requests, stop additional page or batch requests, and preserve completed object results

#### Scenario: Provider cannot interrupt atomic action
- **WHEN** cancellation arrives during a provider action that cannot be interrupted safely
- **THEN** the provider SHALL finish or fail that action, stop subsequent actions, and report the resulting partial state accurately

### Requirement: Recursive deletion contract
Cagnard storage providers SHALL expose recursive deletion with incremental discovery, item progress, and safe partial outcomes for files, objects, and directory-like prefixes.

#### Scenario: Delete filesystem tree
- **WHEN** a filesystem provider recursively deletes a directory
- **THEN** it SHALL delete descendants without following symbolic links outside the configured root and SHALL report child completion before parent directory completion

#### Scenario: Delete S3 prefix
- **WHEN** an S3 provider deletes a directory-like prefix
- **THEN** it SHALL enumerate all matching object pages, delete objects in bounded batches, and report each completed or failed object without requiring the task engine to understand S3 keys

#### Scenario: Encounter retention or permission failure
- **WHEN** recursive deletion encounters a retained, locked, or unauthorized entry
- **THEN** the provider SHALL return a safe item failure, continue independent eligible items where safe, and expose partial completion to the task engine

### Requirement: Unbuffered provider content streams
Cagnard storage providers SHALL support large content reads and writes through bounded-memory streams with byte callbacks and cancellation.

#### Scenario: Stream provider download
- **WHEN** a task downloads a large file or packages it into an archive
- **THEN** the provider SHALL stream bytes to the supplied writer and report progress without returning the complete content as a byte array

#### Scenario: Stream provider upload
- **WHEN** a task uploads a large file
- **THEN** the provider SHALL consume the supplied reader incrementally and report accepted bytes without requiring the complete request body in memory

#### Scenario: Stream unknown size
- **WHEN** content length is unavailable
- **THEN** the provider SHALL stream known bytes and report the total as unknown rather than refusing the operation solely because size is absent

#### Scenario: Close resources on failure
- **WHEN** a stream is canceled or fails
- **THEN** the provider SHALL close readers, writers, SDK bodies, and temporary multipart state and return a diagnostic error without exposing credentials

### Requirement: Provider-neutral archive sources
Cagnard SHALL construct generated download archives from canonical listing and stream-read capabilities rather than adding ZIP-specific behavior to each storage provider.

#### Scenario: Archive mixed providers
- **WHEN** a download selection references entries that the authorized task can read from different provider implementations
- **THEN** the task engine SHALL normalize safe archive paths and stream each source through the same archive writer

#### Scenario: Preserve provider limitations
- **WHEN** a provider cannot recursively list or stream a selected entry
- **THEN** Cagnard SHALL reject or partially fail that archive item according to advertised capabilities instead of buffering through a provider-specific workaround
