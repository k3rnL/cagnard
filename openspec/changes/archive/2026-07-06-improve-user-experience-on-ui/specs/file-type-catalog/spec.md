## MODIFIED Requirements

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

#### Scenario: Classify JSON consistently
- **WHEN** a storage entry has MIME type `application/json`, a JSON-compatible structured media type ending in `+json`, or a `.json` extension
- **THEN** Cagnard SHALL classify the entry as JSON or structured text and expose metadata that allows the JSON opener to match it

### Requirement: Catalog source policy
Cagnard SHALL use the official IANA Media Types registry as the canonical media type source and MAY use practical fallback mappings for common extensions and browser-supported formats.

#### Scenario: Register canonical media type
- **WHEN** a media type is present in the IANA registry
- **THEN** Cagnard SHALL prefer the canonical registered media type name in normalized type metadata

#### Scenario: Use practical extension fallback
- **WHEN** a common file extension is not sufficiently described by provider metadata
- **THEN** Cagnard MAY use maintained fallback mappings to improve display and opener routing

#### Scenario: Normalize backend MIME metadata
- **WHEN** backend MIME metadata includes parameters, casing differences, or provider-specific omissions
- **THEN** Cagnard SHALL normalize enough metadata for catalog classification and opener routing while preserving the raw provider value when useful
