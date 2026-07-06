## MODIFIED Requirements

### Requirement: Backend route compatibility for browser workflows
Cagnard SHALL keep the storage browser functional against the Go backend without changing browser workflows.

#### Scenario: Browse through Go backend
- **WHEN** the authenticated frontend loads navigation, roots, entries, metadata, capabilities, and provider-specific metadata from the Go backend
- **THEN** the storage browser SHALL present the same personal/global roots and file list behavior as it does with the Scala backend

#### Scenario: Mutate through Go backend
- **WHEN** the frontend calls create file, upload, download, create folder, rename, delete, paste, or move actions against the Go backend
- **THEN** those actions SHALL preserve the current success, conflict, blocked, and error behavior expected by the UI

#### Scenario: Open files through Go backend
- **WHEN** the frontend opens text, JSON, Markdown, CSV, raw, or unsupported files through current backend content APIs
- **THEN** the Go backend SHALL provide compatible content, preview, size, and MIME metadata behavior
