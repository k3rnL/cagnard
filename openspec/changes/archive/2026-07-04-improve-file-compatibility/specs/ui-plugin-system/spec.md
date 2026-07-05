## MODIFIED Requirements

### Requirement: File opener plugins
Cagnard SHALL allow UI plugins to provide file openers for MIME types, file extensions, provider metadata, content signatures, or file categories.

#### Scenario: Open exotic file format
- **WHEN** the user opens a file whose format is supported by a registered opener plugin
- **THEN** Cagnard SHALL route file rendering or editing to that plugin according to configured trust and capability policy

#### Scenario: No opener plugin available
- **WHEN** no core opener or UI plugin supports the selected file format
- **THEN** Cagnard SHALL report in-app opening as unavailable and preserve other available actions

### Requirement: Text opener rendering
Cagnard SHALL connect registered text-capable opener plugins to backend-provided bounded text content or safe file content APIs for supported files.

#### Scenario: Render text opener
- **WHEN** the selected file matches a registered text opener and backend content access is available within configured limits
- **THEN** Cagnard SHALL render the text content in the file opening surface

#### Scenario: Opener content unavailable
- **WHEN** the selected file matches an opener but required content access is unavailable
- **THEN** Cagnard SHALL show an opener failure message without blocking other file actions

### Requirement: UI plugin capability declaration
UI plugins SHALL declare their supported file types, required permissions, backend operation requirements, storage capabilities, content access strategy, edit strategy, save strategy, size limits, and security constraints.

#### Scenario: Plugin requires download capability
- **WHEN** an opener plugin requires complete file content access
- **THEN** Cagnard SHALL invoke it only when the selected storage entry exposes the required download or bounded read capability

#### Scenario: Plugin requires partial content capability
- **WHEN** an opener plugin requires range or stream reads
- **THEN** Cagnard SHALL invoke it only when the selected storage provider exposes the required partial content capability

#### Scenario: Plugin requires mutation capability
- **WHEN** a manipulation or editor plugin can write changes back to storage
- **THEN** Cagnard SHALL require the selected storage entry and account to expose the necessary upload, overwrite, rename, versioning, or metadata capabilities

### Requirement: Plugin ordering and fallback
Cagnard SHALL determine UI plugin selection through deterministic ordering, user or admin preference, declared constraints, and safe fallback behavior.

#### Scenario: Multiple opener plugins match
- **WHEN** multiple opener plugins support the selected file
- **THEN** Cagnard SHALL select a plugin according to configured priority or ask the user when policy allows

#### Scenario: Plugin opener fails
- **WHEN** the selected UI plugin fails to open a file
- **THEN** Cagnard SHALL report the failure and offer another compatible opener path when available

#### Scenario: Plugin declines file
- **WHEN** a plugin determines that a file is unsupported, too large, unsafe, or malformed
- **THEN** Cagnard SHALL treat the refusal as a normal fallback condition rather than a browser failure
