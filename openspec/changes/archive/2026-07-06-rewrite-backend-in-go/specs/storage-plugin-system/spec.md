## MODIFIED Requirements

### Requirement: Provider-neutral storage abstraction
Cagnard SHALL preserve the provider-neutral storage abstraction in the Go backend.

#### Scenario: Register existing providers
- **WHEN** configuration declares Unix filesystem or S3-compatible providers supported by the Scala backend
- **THEN** the Go backend SHALL register equivalent provider implementations under the same provider ids, account ids, root ids, and capability model

#### Scenario: Preserve storage entry model
- **WHEN** a Go provider returns a storage entry
- **THEN** it SHALL preserve normalized id, name, path, kind, metadata, capabilities, and provider-specific metadata fields used by the frontend

### Requirement: Filesystem provider parity
The Go Unix filesystem provider SHALL preserve the Scala filesystem provider semantics.

#### Scenario: Resolve paths safely
- **WHEN** a filesystem operation receives a relative path
- **THEN** the Go provider SHALL resolve it within the configured root and reject traversal outside that root before reading or writing content

#### Scenario: Stream filesystem transfer
- **WHEN** a provider-neutral transfer copies between filesystem roots
- **THEN** the Go filesystem provider SHALL expose stream read and stream write capabilities so the transfer engine avoids full in-memory buffering

#### Scenario: Delete directory tree
- **WHEN** the user deletes a non-empty filesystem directory
- **THEN** the Go provider SHALL delete the entry tree or return a safe user-facing error without leaking host paths unnecessarily

### Requirement: Capability parity
Cagnard SHALL preserve provider capability names, statuses, and descriptions that drive browser actions and transfer planning.

#### Scenario: Report read-only root limitations
- **WHEN** a root is read-only
- **THEN** the Go provider SHALL report mutation capabilities as unsupported consistently with the Scala reference backend

#### Scenario: Report content access capabilities
- **WHEN** a provider supports full read, bounded read, stream read, stream write, or only buffered fallback
- **THEN** the Go backend SHALL expose those capabilities in the same normalized names used by the frontend and transfer service
