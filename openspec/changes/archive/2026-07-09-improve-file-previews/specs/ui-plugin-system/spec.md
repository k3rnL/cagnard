## MODIFIED Requirements

### Requirement: File opener plugins
Cagnard SHALL allow UI plugins to provide file openers for MIME types, file extensions, provider metadata, content signatures, or file categories, using the same registration mechanism for first-party and third-party openers alike.

#### Scenario: Open exotic file format
- **WHEN** the user opens a file whose format is supported by a registered opener plugin
- **THEN** Cagnard SHALL route file rendering or editing to that plugin according to configured trust and capability policy

#### Scenario: No opener plugin available
- **WHEN** no core opener or UI plugin supports the selected file format
- **THEN** Cagnard SHALL report in-app opening as unavailable and preserve other available actions

#### Scenario: Register first-party opener as a plugin
- **WHEN** Cagnard registers an opener it ships by default, such as the text, log, media, CSV, JSON, PDF, or archive opener
- **THEN** Cagnard SHALL register it through the same opener registry entry shape used for any other opener plugin, with no code path that treats it as structurally distinct

### Requirement: UI plugin capability declaration
UI plugins SHALL declare their supported file types, required permissions, backend operation requirements, storage capabilities, content access strategy, edit strategy, save strategy, size limits, target rendering engine, and security constraints.

#### Scenario: Plugin requires download capability
- **WHEN** an opener plugin requires complete file content access
- **THEN** Cagnard SHALL invoke it only when the selected storage entry exposes the required download or bounded read capability

#### Scenario: Plugin requires partial content capability
- **WHEN** an opener plugin requires range or stream reads
- **THEN** Cagnard SHALL invoke it only when the selected storage provider exposes the required partial content capability

#### Scenario: Plugin requires mutation capability
- **WHEN** a manipulation or editor plugin can write changes back to storage
- **THEN** Cagnard SHALL require the selected storage entry and account to expose the necessary upload, overwrite, rename, versioning, or metadata capabilities

#### Scenario: Plugin declares target rendering engine
- **WHEN** a plugin is registered
- **THEN** Cagnard SHALL render it using the rendering engine and view the plugin declares, rather than defaulting every plugin to a single fixed view
