## ADDED Requirements

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
