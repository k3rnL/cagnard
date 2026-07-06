## MODIFIED Requirements

### Requirement: Explicit file opening
Cagnard SHALL open file content only through an explicit one-click user action and a selected compatible file opener.

#### Scenario: Open selected file
- **WHEN** the user clicks a file entry in the browser listing
- **THEN** Cagnard SHALL choose a compatible opener or show an unsupported-file state without requiring a double click or separate Open button

#### Scenario: Keep directory browse lightweight
- **WHEN** the user selects an entry using selection controls rather than row activation
- **THEN** Cagnard SHALL update metadata and available actions without requiring file content to be fetched

#### Scenario: Keep selection separate from opening
- **WHEN** the user clicks the checkbox, selection affordance, or multi-select control for a file
- **THEN** Cagnard SHALL change selection without opening file content

### Requirement: File opener registry
Cagnard SHALL route file opening through a deterministic opener registry that includes first-party and plugin-provided openers.

#### Scenario: Match opener by declared support
- **WHEN** a file is opened
- **THEN** Cagnard SHALL match candidate openers using declared MIME patterns, categories, extensions, provider metadata, or content hints

#### Scenario: Match JSON opener
- **WHEN** a file has MIME type `application/json`, a JSON-compatible structured media type, or a `.json` extension
- **THEN** Cagnard SHALL match it to the JSON-capable opener when size and storage capabilities permit

#### Scenario: Multiple openers match
- **WHEN** multiple compatible openers match a file
- **THEN** Cagnard SHALL select one by configured priority or allow user/admin choice when policy permits

#### Scenario: No opener matches
- **WHEN** no compatible opener exists
- **THEN** Cagnard SHALL show known type metadata and available non-open actions instead of failing the browser workflow

### Requirement: Built-in common openers
Cagnard SHALL provide first-party opener plugins for common user and developer file types.

#### Scenario: Open text and source file
- **WHEN** the user opens a supported text, source, config, or log file within configured limits
- **THEN** Cagnard SHALL provide a raw/source view with search, line numbers, wrap control, and safe text decoding

#### Scenario: Open Markdown file
- **WHEN** the user opens a Markdown file within configured limits
- **THEN** Cagnard SHALL provide rendered and source views and MAY allow editing when write-back is authorized

#### Scenario: Open JSON file
- **WHEN** the user opens a JSON file within configured limits
- **THEN** Cagnard SHALL provide source and structured views with validation and formatting actions such as prettify or minify

#### Scenario: Open CSV or TSV file
- **WHEN** the user opens a CSV or TSV file
- **THEN** Cagnard SHALL provide a table-oriented view with raw fallback and SHALL avoid loading excessive rows into the browser at once

#### Scenario: Open browser-native media
- **WHEN** the user opens a browser-supported image, PDF, audio, or video file and storage access permits safe delivery
- **THEN** Cagnard SHALL provide an in-app viewer using browser-native capabilities where practical
