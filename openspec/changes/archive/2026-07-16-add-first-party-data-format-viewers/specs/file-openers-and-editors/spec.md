## MODIFIED Requirements

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

### Requirement: Core-mediated opener access
Cagnard SHALL provide first-party openers with scoped content and mutation APIs mediated by core authorization, provider capabilities, and audit policy.

#### Scenario: Scoped file handle
- **WHEN** an opener receives access to a file
- **THEN** it SHALL receive only scoped access to the selected file and approved operations

#### Scenario: Deny raw credentials
- **WHEN** a first-party opener requests file content
- **THEN** Cagnard SHALL mediate the request without exposing raw provider credentials to frontend code

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
