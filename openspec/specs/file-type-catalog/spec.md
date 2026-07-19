## Purpose

Defines file type classification, MIME/media type normalization, extension fallback, category mapping, and icon identifiers used by the browser and file opener registry.
## Requirements
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

### Requirement: Catalog source policy
Cagnard SHALL use the official IANA Media Types registry as the canonical media type source and MAY use practical fallback mappings for common extensions and browser-supported formats.

#### Scenario: Register canonical media type
- **WHEN** a media type is present in the IANA registry
- **THEN** Cagnard SHALL prefer the canonical registered media type name in normalized type metadata

#### Scenario: Use practical extension fallback
- **WHEN** a common file extension is not sufficiently described by provider metadata
- **THEN** Cagnard MAY use maintained fallback mappings to improve display and opener routing

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

### Requirement: NetCDF type recognition
The file type catalog SHALL recognize NetCDF candidates using maintained MIME aliases, practical extensions, and content signatures while distinguishing classic NetCDF, NetCDF-4/HDF5, and unrelated HDF5 files when validated.

#### Scenario: Recognize by verified signature
- **WHEN** content validation identifies a CDF-1, CDF-2, CDF-5, or NetCDF-4 structure
- **THEN** Cagnard SHALL classify the file as scientific NetCDF data and report the verified variant

#### Scenario: Extension is the only hint
- **WHEN** `.nc`, `.nc4`, `.cdf`, or another configured NetCDF extension is paired with generic provider MIME metadata
- **THEN** Cagnard SHALL classify it as a candidate requiring content validation rather than assuming a verified variant

#### Scenario: Generic HDF5 content
- **WHEN** an HDF5 file does not validate as NetCDF-4
- **THEN** Cagnard SHALL retain an HDF5 or generic binary classification and SHALL NOT advertise NetCDF semantics

### Requirement: Iceberg table candidate classification
The catalog SHALL represent Iceberg as a validated folder capability derived from metadata signals rather than as a filename extension or unconditional directory type.

#### Scenario: Metadata signals are credible
- **WHEN** an authorized folder probe finds a compatible metadata directory and Iceberg metadata signals
- **THEN** Cagnard SHALL attach an Iceberg candidate or supported capability to that folder without replacing its directory classification

#### Scenario: Signals disappear or become invalid
- **WHEN** a refreshed probe no longer validates the Iceberg metadata
- **THEN** Cagnard SHALL remove the analytical capability while preserving the folder's normal classification and navigation
