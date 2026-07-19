## ADDED Requirements

### Requirement: Scientific data opener routing
Cagnard SHALL route validated NetCDF files to the first-party scientific-array opener while retaining safe fallback actions for unsupported variants.

#### Scenario: NetCDF extension has generic MIME type
- **WHEN** a file has a recognized NetCDF extension but generic or absent provider MIME metadata
- **THEN** Cagnard SHALL content-validate the candidate before selecting the NetCDF opener

#### Scenario: MIME type conflicts with content
- **WHEN** provider metadata suggests NetCDF but content validation fails
- **THEN** Cagnard SHALL avoid the NetCDF opener and show the best verified fallback without treating the browser as failed

### Requirement: Alternate analytical folder opening
Cagnard SHALL support a first-party analytical opener as an explicit alternative for a compatible folder without changing the folder's default navigation action.

#### Scenario: Iceberg alternative is available
- **WHEN** a folder has been validated as a supported Iceberg table
- **THEN** the opener registry SHALL expose **Open as Iceberg table** as a contextual alternative

#### Scenario: Open folder through normal activation
- **WHEN** a user activates a compatible folder without choosing the analytical alternative
- **THEN** Cagnard SHALL continue normal directory navigation

#### Scenario: Analytical opener becomes unavailable
- **WHEN** table validation or runtime initialization fails
- **THEN** Cagnard SHALL preserve folder navigation and non-open actions and report the opener-specific failure separately
