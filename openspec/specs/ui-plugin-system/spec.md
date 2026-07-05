## Purpose

Defines frontend plugin extension points for file openers, file manipulation, and contextual UI contributions.

## Requirements

### Requirement: Frontend plugin extension points
Cagnard SHALL allow UI plugins to extend the frontend through declared extension points without requiring changes to the core browser UI.

#### Scenario: Register UI plugin
- **WHEN** a UI plugin is declared in configuration and passes compatibility checks
- **THEN** Cagnard SHALL register its declared extension points for the frontend

#### Scenario: Reject incompatible UI plugin
- **WHEN** a UI plugin requires an unsupported Cagnard UI plugin API version
- **THEN** Cagnard SHALL reject or disable the plugin with explicit diagnostics

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

### Requirement: File manipulation plugins
Cagnard SHALL allow UI plugins to declare file manipulation actions such as inspect, convert, edit metadata, validate, or transform when those actions are authorized.

#### Scenario: Plugin action for selected file
- **WHEN** a UI plugin declares an action for the selected file type and the user has rights to run it
- **THEN** Cagnard SHALL expose the action contextually for that selection

#### Scenario: Unauthorized plugin action
- **WHEN** the user lacks rights for a UI plugin action
- **THEN** Cagnard SHALL hide or disable the action according to configured policy

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

### Requirement: UI plugin isolation
Cagnard SHALL isolate UI plugins from raw credentials, unrelated storage entries, and unauthorized backend APIs.

#### Scenario: Plugin receives scoped file access
- **WHEN** a UI plugin opens, previews, edits, or manipulates a selected file
- **THEN** Cagnard SHALL provide only scoped access to the selected file and approved operation APIs

#### Scenario: Plugin requests raw credential
- **WHEN** a UI plugin attempts to access raw storage credentials
- **THEN** Cagnard SHALL deny the request

### Requirement: Provider and storage plugin coordination
Cagnard SHALL allow UI plugins to coordinate with storage plugins through normalized file metadata and declared provider-specific extensions.

#### Scenario: Provider-specific metadata extension
- **WHEN** a UI plugin supports a provider-specific metadata extension for the selected entry
- **THEN** Cagnard SHALL expose the namespaced metadata extension to the plugin without leaking unrelated provider internals

#### Scenario: Normalized metadata extension
- **WHEN** a UI plugin can operate from normalized metadata only
- **THEN** Cagnard SHALL allow the plugin to work across providers that provide the required normalized fields

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
