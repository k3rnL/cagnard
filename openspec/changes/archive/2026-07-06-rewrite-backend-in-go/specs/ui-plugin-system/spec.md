## MODIFIED Requirements

### Requirement: UI plugin manifest discovery
Cagnard SHALL preserve UI plugin manifest discovery in the Go backend.

#### Scenario: Load configured UI plugins
- **WHEN** HOCON configuration declares enabled UI plugins
- **THEN** the Go backend SHALL expose the same manifest fields, ordering, MIME types, extensions, permissions, and priorities through the existing plugin API

#### Scenario: Preserve disabled plugin behavior
- **WHEN** a UI plugin is disabled in configuration
- **THEN** the Go backend SHALL omit it from the frontend discovery response

### Requirement: UI plugin content coordination
Cagnard SHALL preserve backend content and capability behavior used by UI file openers.

#### Scenario: Text opener content
- **WHEN** a UI opener requires bounded or full file content within configured limits
- **THEN** the Go backend SHALL enforce the same provider capability and size-limit checks as the Scala backend

#### Scenario: Write-back availability
- **WHEN** an editor-capable opener determines whether a file can be saved
- **THEN** the Go backend SHALL expose write-back capabilities consistently with the storage provider implementation
