## ADDED Requirements

### Requirement: File type catalog
Cagnard SHALL maintain a file type catalog that maps known MIME/media types, common extensions, top-level media categories, specific format identifiers, and display icon categories.

#### Scenario: Classify provider supplied MIME type
- **WHEN** a storage entry includes a provider-supplied MIME type
- **THEN** Cagnard SHALL classify the entry using the catalog without requiring provider-specific UI logic

#### Scenario: Infer type from extension
- **WHEN** a storage entry does not include a provider-supplied MIME type but has a known extension
- **THEN** Cagnard MAY infer a MIME type, category, and icon from the file type catalog as fallback metadata

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
Cagnard SHALL provide category and specific-format icon identifiers for browser listings, metadata surfaces, and unsupported-file states.

#### Scenario: Show category icon
- **WHEN** a file is classified as image, video, audio, text, archive, document, spreadsheet, code, configuration, or unknown
- **THEN** Cagnard SHALL expose an icon identifier suitable for that category

#### Scenario: Show specific format icon
- **WHEN** a file matches a specific known format with a dedicated icon mapping
- **THEN** Cagnard MAY expose the specific icon identifier instead of the generic category icon
