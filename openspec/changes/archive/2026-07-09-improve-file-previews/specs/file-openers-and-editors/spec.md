## MODIFIED Requirements

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
Cagnard SHALL provide first-party opener plugins for common user and developer file types, registered through the same opener registry mechanism as any other opener plugin.

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
- **WHEN** the user opens a JSON file within configured limits
- **THEN** Cagnard SHALL provide source and structured views with validation and formatting actions such as prettify or minify

#### Scenario: Open YAML file
- **WHEN** the user opens a YAML file within configured limits
- **THEN** Cagnard SHALL provide source and structured tree views comparable to the JSON structured view

#### Scenario: Open diff or patch file
- **WHEN** the user opens a diff or patch file within configured limits
- **THEN** Cagnard SHALL provide a view that visually distinguishes added and removed lines

#### Scenario: Open CSV or TSV file
- **WHEN** the user opens a CSV or TSV file
- **THEN** Cagnard SHALL provide a table-oriented view with raw fallback and SHALL avoid loading excessive rows into the browser at once

#### Scenario: Open log file
- **WHEN** the user opens a recognized log file
- **THEN** Cagnard SHALL provide a log-oriented view with level-based coloring in addition to the standard text capabilities

#### Scenario: Follow a growing log file
- **WHEN** the user enables follow mode on an open log file that supports change notification
- **THEN** Cagnard SHALL append newly written content to the view as it arrives without requiring manual refresh

#### Scenario: Open browser-native media
- **WHEN** the user opens a browser-supported image, PDF, audio, or video file and storage access permits safe delivery
- **THEN** Cagnard SHALL provide an in-app viewer using browser-native capabilities where practical
