## ADDED Requirements

### Requirement: NetCDF format-family inspection
Cagnard SHALL provide a first-party read-only NetCDF opener that validates and reports supported CDF-1, CDF-2, CDF-5, and NetCDF-4/HDF5 files through NetCDF semantics.

#### Scenario: Open a supported NetCDF file
- **WHEN** content signature and semantic validation identify a supported NetCDF variant
- **THEN** Cagnard SHALL open the scientific-array viewer and identify the verified variant

#### Scenario: HDF5 file is not NetCDF
- **WHEN** a file has an HDF5 signature but does not satisfy NetCDF-4 semantic requirements
- **THEN** Cagnard SHALL NOT reinterpret generic HDF5 groups or datasets as NetCDF variables

#### Scenario: Variant or feature is unsupported
- **WHEN** a NetCDF file uses an unsupported type, codec, storage feature, or malformed structure
- **THEN** Cagnard SHALL preserve available safe metadata and original download actions while explaining the limitation

### Requirement: NetCDF semantic catalog
Cagnard SHALL expose NetCDF groups, dimensions, coordinate variables, data variables, attributes, types, shapes, chunking, compression, fill values, and descriptive metadata that the active reader can determine accurately.

#### Scenario: Browse variables
- **WHEN** the Data view opens
- **THEN** Cagnard SHALL show a bounded variable catalog containing group, name, dimensions, shape, type, units, standard name, and inferred role where available

#### Scenario: Inspect schema hierarchy
- **WHEN** the Schema view is active
- **THEN** Cagnard SHALL preserve group and dimension hierarchy, unlimited dimensions, coordinate relationships, and supported user-defined types without flattening them away

#### Scenario: Inspect metadata
- **WHEN** the Metadata view is active
- **THEN** Cagnard SHALL distinguish global, group, and variable attributes and report storage metadata without presenting inferred values as declared metadata

### Requirement: Bounded multidimensional variable slicing
Cagnard SHALL require an explicit bounded slice for multidimensional data and SHALL select display controls appropriate to variable dimensionality.

#### Scenario: Select a scalar variable
- **WHEN** a selected variable has no dimensions
- **THEN** Cagnard SHALL show its typed decoded value and available raw value

#### Scenario: Select a one-dimensional variable
- **WHEN** a selected variable has one display dimension within configured limits
- **THEN** Cagnard SHALL show a line representation and an accessible tabular representation over its coordinate or index

#### Scenario: Select a two-dimensional variable
- **WHEN** a selected variable has two display dimensions within configured limits
- **THEN** Cagnard SHALL show a heatmap and an accessible tabular representation with dimension coordinates or indices

#### Scenario: Select a variable with three or more dimensions
- **WHEN** a selected variable has more than two dimensions
- **THEN** Cagnard SHALL require X and Y display dimensions plus an explicit coordinate, index, or bounded range for every remaining dimension before reading cells

#### Scenario: Slice exceeds a configured limit
- **WHEN** the calculated cells, bytes, rows, or payload exceed a configured ceiling
- **THEN** Cagnard SHALL refuse the read before materialization and direct the user to narrow dimensions or variables without silently sampling

### Requirement: CF-aware coordinate and value decoding
Cagnard SHALL apply supported Climate and Forecast metadata conventions accurately while preserving access to raw values and declarations.

#### Scenario: Recognize coordinate axes
- **WHEN** validated CF metadata identifies time, vertical, latitude, or longitude coordinates
- **THEN** Cagnard SHALL use them to propose display dimensions and selectors while allowing the user to override the choice

#### Scenario: Decode packed or missing values
- **WHEN** a variable declares supported fill, missing, scale, or offset metadata
- **THEN** Cagnard SHALL apply missing-value handling and supported scale and offset decoding in the defined order and identify decoded mode

#### Scenario: Inspect stored values
- **WHEN** the user enables Raw values
- **THEN** Cagnard SHALL show stored values without the decoded transformation and preserve the active slice

#### Scenario: CF metadata is absent or contradictory
- **WHEN** coordinate or convention metadata cannot be applied confidently
- **THEN** Cagnard SHALL expose manual dimension selection and raw attributes without claiming an inferred scientific meaning

### Requirement: Controlled NetCDF relational projection
Cagnard SHALL expose filters, ordered sorts, bounded exports, and SQL only through an explicit relational projection of the active NetCDF slice.

#### Scenario: Project one variable
- **WHEN** a bounded variable slice is prepared for relational operations
- **THEN** `data` SHALL contain dimension coordinate or index columns and one typed value column for that variable

#### Scenario: Project compatible variables
- **WHEN** a user selects multiple variables with compatible active dimensions and coordinates
- **THEN** Cagnard SHALL expose their value columns in one `data` relation without an implicit ambiguous join

#### Scenario: Relational scope is displayed
- **WHEN** NetCDF `data` is available
- **THEN** the viewer SHALL label it as **Current slice** and show the active variables, dimensions, decoded or raw mode, and bounded row count

#### Scenario: Slice selection changes
- **WHEN** the user changes a variable, dimension, range, coordinate, or decoded mode
- **THEN** Cagnard SHALL invalidate the prior relation and query results before exposing the new scope

#### Scenario: Complete variable is unbounded
- **WHEN** a complete variable would exceed relational limits
- **THEN** Cagnard SHALL require a narrower slice and SHALL NOT imply that SQL, filtering, sorting, or export covers the complete variable

### Requirement: Random-access NetCDF processing
Cagnard SHALL use authenticated bounded or range reads where supported and apply explicit full-buffer limits when random access is unavailable.

#### Scenario: Reader supports random access
- **WHEN** a supported NetCDF reader requests file regions
- **THEN** Cagnard SHALL serve authorized same-origin ranges for filesystem and S3 sources without exposing provider credentials

#### Scenario: Reader requires full buffering
- **WHEN** the selected reader cannot inspect the file through bounded random access
- **THEN** Cagnard SHALL buffer only below the configured source ceiling and SHALL report an actionable limit above it

#### Scenario: Cancel slice processing
- **WHEN** a user cancels opening, slicing, plotting, projection, or querying
- **THEN** Cagnard SHALL abort associated reads and worker work, retain stable prior state where available, and release source-specific buffers

### Requirement: Integrated scientific-array interaction surface
The NetCDF viewer SHALL reuse Cagnard's established structured-data controls and remain elegant, accessible, stable, and usable across supported themes and viewports.

#### Scenario: Scientific controls exceed available width
- **WHEN** variable, dimension, range, or decoded-value controls do not fit on one row
- **THEN** Cagnard SHALL group or wrap them without hiding Apply, Stop, raw-mode, table fallback, or active-slice context

#### Scenario: Plot is displayed
- **WHEN** a line or heatmap representation is active
- **THEN** it SHALL use themed contrast, stable responsive dimensions, readable labels, keyboard-reachable selectors, and an equivalent tabular value path

#### Scenario: Popover or selector is opened
- **WHEN** a variable, dimension, or column control opens above a plot or grid
- **THEN** it SHALL remain interactive above adjacent surfaces, dismiss on outside click and Escape, and preserve visible focus treatment
