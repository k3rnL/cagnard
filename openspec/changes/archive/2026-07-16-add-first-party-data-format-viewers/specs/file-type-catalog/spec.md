## MODIFIED Requirements

### Requirement: File type catalog
Cagnard SHALL maintain aligned backend and frontend file type catalogs that map known MIME/media types, common extensions, top-level media categories, specific format identifiers, and display icon categories, including supported analytical formats.

#### Scenario: Classify provider supplied MIME type
- **WHEN** a storage entry includes a provider-supplied MIME type
- **THEN** Cagnard SHALL classify the entry using the catalog without requiring provider-specific UI logic

#### Scenario: Infer type from extension
- **WHEN** a storage entry does not include a provider-supplied MIME type but has a known extension
- **THEN** Cagnard MAY infer a MIME type, category, and icon from the file type catalog as fallback metadata

#### Scenario: Prefer analytical extension over generic binary MIME
- **WHEN** a provider reports a generic binary MIME type for a recognized Parquet, Avro, Arrow IPC, Feather, NDJSON, CSV, or TSV extension
- **THEN** Cagnard SHALL preserve the more specific analytical format classification for opener routing

#### Scenario: Distinguish JSON records from JSON document
- **WHEN** a file uses a recognized `.jsonl` or `.ndjson` extension or NDJSON media type
- **THEN** Cagnard SHALL classify it as record-oriented JSON rather than an ordinary whole-document JSON file

#### Scenario: Preserve unknown type
- **WHEN** a storage entry has an unknown MIME type and unknown extension
- **THEN** Cagnard SHALL preserve the file as an unknown or binary type and continue to expose safe metadata and actions

### Requirement: File icon classification
Cagnard SHALL provide category and specific-format icon identifiers for browser listings, metadata surfaces, structured-data files, and unsupported-file states.

#### Scenario: Show category icon
- **WHEN** a file is classified as image, video, audio, text, archive, document, spreadsheet, code, configuration, analytical data, or unknown
- **THEN** Cagnard SHALL expose an icon identifier suitable for that category

#### Scenario: Show specific format icon
- **WHEN** a file matches a specific known format with a dedicated icon mapping
- **THEN** Cagnard MAY expose the specific icon identifier instead of the generic category icon

#### Scenario: Show analytical format label
- **WHEN** a file is classified as Parquet, Avro, Arrow IPC, Feather, NDJSON, CSV, or TSV
- **THEN** browser and opener surfaces SHALL show the specific format label instead of a generic binary label
