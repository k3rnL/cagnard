## Purpose

Defines listing and nested, recursive preview of entries inside supported archive formats, reusing the byte-range read engine and routing entry opens back through the unified opener registry.

## Requirements

### Requirement: Archive content listing
Cagnard SHALL list the entries of a supported archive file without requiring the entire archive to be downloaded first, when the storage provider and archive format allow partial access.

#### Scenario: List zip archive entries
- **WHEN** the user opens a supported zip archive
- **THEN** Cagnard SHALL show its entries by reading only the archive's directory structure rather than the full archive content

#### Scenario: List sequential archive entries
- **WHEN** the user opens a supported archive format that has no random-access directory structure
- **THEN** Cagnard SHALL list its entries by scanning the archive content and MAY take time proportional to archive size

#### Scenario: Unsupported archive format
- **WHEN** the user opens an archive format that is not supported for browsing
- **THEN** Cagnard SHALL fall back to metadata-only display instead of failing the open action

### Requirement: Supported archive formats
Cagnard SHALL support browsing zip, tar, gzip-compressed tar, and gzip archive formats using dependency-free standard capabilities.

#### Scenario: Browse zip
- **WHEN** the user opens a `.zip` file
- **THEN** Cagnard SHALL list its entries and allow opening them

#### Scenario: Browse tar and compressed tar
- **WHEN** the user opens a `.tar`, `.tar.gz`, or `.tgz` file
- **THEN** Cagnard SHALL list its entries and allow opening them

#### Scenario: Browse gzip
- **WHEN** the user opens a `.gz` file that is not a tar archive
- **THEN** Cagnard SHALL treat it as a single compressed entry

#### Scenario: Unsupported proprietary archive
- **WHEN** the user opens a `.rar` or `.7z` file
- **THEN** Cagnard SHALL show archive metadata only and SHALL NOT attempt to list entries

### Requirement: Nested opener routing for archive entries
Cagnard SHALL open an archive entry through the same opener registry used for ordinary storage entries, based on the entry's own type classification.

#### Scenario: Open structured entry inside archive
- **WHEN** the user opens an entry inside a browsed archive whose type matches a registered opener
- **THEN** Cagnard SHALL render that entry using the matching opener as if it were a standalone file

#### Scenario: Open unsupported entry inside archive
- **WHEN** the user opens an entry inside a browsed archive whose type has no matching opener
- **THEN** Cagnard SHALL show the entry's metadata and an unsupported-file state without failing archive browsing

#### Scenario: Nested archive entry
- **WHEN** an entry inside a browsed archive is itself a supported archive format
- **THEN** Cagnard MAY allow browsing into that nested archive using the same listing and routing behavior

### Requirement: Archive entry content access
Cagnard SHALL read an individual archive entry's content without requiring the entire archive to be extracted or downloaded, when the archive format and storage provider support partial access.

#### Scenario: Read zip entry content
- **WHEN** the user opens an entry inside a zip archive
- **THEN** Cagnard SHALL read only that entry's compressed data range from the underlying storage location

#### Scenario: Read sequential archive entry content
- **WHEN** the user opens an entry inside a tar-based archive
- **THEN** Cagnard SHALL extract that entry's content from the archive stream
