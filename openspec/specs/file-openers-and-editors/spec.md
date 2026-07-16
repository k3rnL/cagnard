## Purpose

Defines explicit in-app file opening, opener/editor plugin selection, safe content access, large-file fallback behavior, and first-party opener expectations.
## Requirements
### Requirement: Explicit file opening
Cagnard SHALL open file content only through an explicit user action and a selected compatible file opener.

#### Scenario: Open selected file
- **WHEN** the user activates open on a file entry
- **THEN** Cagnard SHALL choose a compatible opener or show an unsupported-file state without automatically loading content during row selection

#### Scenario: Keep directory browse lightweight
- **WHEN** the user selects an entry in the browser listing
- **THEN** Cagnard SHALL update metadata and available actions without requiring file content to be fetched

### Requirement: File opener registry
Cagnard SHALL route file opening through a deterministic, typed registry of first-party openers whose rendering and format behavior ship with the frontend.

#### Scenario: Match opener by declared support
- **WHEN** a file is opened
- **THEN** Cagnard SHALL match candidate first-party openers using declared MIME patterns, categories, extensions, provider metadata, or content hints

#### Scenario: Multiple openers match
- **WHEN** multiple compatible first-party openers match a file
- **THEN** Cagnard SHALL select one by deterministic built-in priority or allow user choice when the frontend explicitly supports it

#### Scenario: Lazy-load specialized opener
- **WHEN** the selected first-party opener requires a specialized component, worker, parser, or WASM engine
- **THEN** Cagnard SHALL load that implementation on demand without adding it to the initial browser execution path

#### Scenario: No opener matches
- **WHEN** no compatible opener exists
- **THEN** Cagnard SHALL show known type metadata and available non-open actions instead of failing the browser workflow

### Requirement: Opener capability declarations
Each opener SHALL declare its viewing, editing, content access, save, size, and execution constraints before Cagnard routes files to it.

#### Scenario: Enforce size limit
- **WHEN** a file exceeds the selected opener's declared maximum size or configured safety limit
- **THEN** Cagnard SHALL refuse that opener and offer fallback actions or another compatible opener

#### Scenario: Enforce required storage capability
- **WHEN** an opener requires download, bounded read, range read, stream read, upload, overwrite, versioning, or metadata write support
- **THEN** Cagnard SHALL route the file to that opener only if the selected storage entry and account expose the required capabilities

#### Scenario: Enforce edit strategy
- **WHEN** an opener declares that editing is unsupported or export-only
- **THEN** Cagnard SHALL not offer direct write-back for that opener

### Requirement: Core-mediated opener access
Cagnard SHALL provide first-party openers with scoped content and mutation APIs mediated by core authorization, provider capabilities, and audit policy.

#### Scenario: Scoped file handle
- **WHEN** an opener receives access to a file
- **THEN** it SHALL receive only scoped access to the selected file and approved operations

#### Scenario: Deny raw credentials
- **WHEN** a first-party opener requests file content
- **THEN** Cagnard SHALL mediate the request without exposing raw provider credentials to frontend code

### Requirement: Large-file-safe opening
Cagnard SHALL avoid requiring full in-memory loading for all open/view/edit workflows and SHALL provide safe fallback for files that exceed opener or storage limits.

#### Scenario: Decline large text operation
- **WHEN** a text-like file exceeds the configured full-read or text-processing limit and the opener does not support pagination
- **THEN** Cagnard SHALL decline full formatting/editing and offer safe alternatives such as raw limited view, metadata, or download

#### Scenario: Paginate large text file
- **WHEN** a text-like file exceeds the configured full-read limit and the opener supports pagination
- **THEN** Cagnard SHALL provide the initial portion of the file and allow the user to load further portions on demand instead of refusing to open the file

#### Scenario: Partial-capable opener
- **WHEN** an opener declares range or stream read support and the storage provider exposes the required capability
- **THEN** Cagnard MAY open the file through partial or streaming access without materializing the entire object first

#### Scenario: Seekable media playback
- **WHEN** the user opens a media file through an opener and storage entry that both support range reads
- **THEN** Cagnard SHALL allow seeking within the media without requiring the full file to be downloaded first

### Requirement: Built-in common openers
Cagnard SHALL provide first-party openers for common user, developer, and supported analytical file types through the typed built-in opener registry.

#### Scenario: Open text and source file
- **WHEN** the user opens a supported text, source, config, or log file within configured limits
- **THEN** Cagnard SHALL provide a raw/source view with search, line numbers, wrap control, and safe text decoding

#### Scenario: Syntax-highlighted source file
- **WHEN** the user opens a source code file with a recognized language
- **THEN** Cagnard SHALL apply syntax highlighting for that language in the raw/source view

#### Scenario: Open Markdown file
- **WHEN** the user opens a Markdown file within configured limits
- **THEN** Cagnard SHALL provide rendered and source views and MAY allow editing when write-back is authorized

#### Scenario: Open JSON file
- **WHEN** the user opens a JSON document within configured limits
- **THEN** Cagnard SHALL provide source and structured views with validation and formatting actions such as prettify or minify

#### Scenario: Open YAML file
- **WHEN** the user opens a YAML file within configured limits
- **THEN** Cagnard SHALL provide source and structured tree views comparable to the JSON structured view

#### Scenario: Open diff or patch file
- **WHEN** the user opens a diff or patch file within configured limits
- **THEN** Cagnard SHALL provide a view that visually distinguishes added and removed lines

#### Scenario: Open CSV or TSV file
- **WHEN** the user opens a CSV or TSV file
- **THEN** Cagnard SHALL provide the first-party structured-data table with bounded raw fallback and SHALL avoid loading excessive rows into the browser at once

#### Scenario: Open supported analytical file
- **WHEN** the user opens a supported Parquet, Avro OCF, Arrow IPC, Feather, or NDJSON file
- **THEN** Cagnard SHALL route it to the corresponding first-party read-only structured-data source

#### Scenario: Open log file
- **WHEN** the user opens a recognized log file
- **THEN** Cagnard SHALL provide a log-oriented view with level-based coloring in addition to the standard text capabilities

#### Scenario: Follow a growing log file
- **WHEN** the user enables follow mode on an open log file that supports change notification
- **THEN** Cagnard SHALL append newly written content to the view as it arrives without requiring manual refresh

#### Scenario: Open browser-native media
- **WHEN** the user opens a browser-supported image, PDF, audio, or video file and storage access permits safe delivery
- **THEN** Cagnard SHALL provide an in-app viewer using browser-native capabilities where practical
