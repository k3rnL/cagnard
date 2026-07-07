## ADDED Requirements

### Requirement: Provider-neutral paginated listing
Storage plugins SHALL expose a provider-neutral paginated listing operation for browser-facing directory listings.

#### Scenario: Return listing page
- **WHEN** Cagnard asks a storage plugin for a paginated listing
- **THEN** the plugin SHALL return entries for the requested page, normalized accuracy metadata, and a provider cursor when another page can be loaded

#### Scenario: Apply listing criteria before slicing
- **WHEN** listing options include search, sort key, or sort direction
- **THEN** the plugin or backend adapter SHALL apply those criteria to the current directory scope before page slicing

#### Scenario: Use provider-native cursor
- **WHEN** the provider exposes a native continuation token, offset, keyset cursor, or equivalent page reference
- **THEN** the plugin MAY use that native cursor internally while exposing only provider-neutral cursor data to Cagnard core

#### Scenario: Preserve stateless page references
- **WHEN** the browser receives a page reference
- **THEN** that reference SHALL be opaque to the browser and SHALL be validated by the backend before any provider cursor is used

### Requirement: Listing accuracy reporting
Storage plugins SHALL report whether paginated listing search, sorting, and total counts are exact, unknown, unsupported, or degraded.

#### Scenario: Exact listing
- **WHEN** the provider applies the requested criteria to the complete current directory scope
- **THEN** Cagnard SHALL report search and sort accuracy as exact

#### Scenario: Unknown total
- **WHEN** the provider can return a page but cannot cheaply compute the total result count
- **THEN** Cagnard SHALL report the total as unknown rather than estimating it from the current page

#### Scenario: Unsupported listing criteria
- **WHEN** a provider cannot satisfy a requested search or sort mode within configured limits
- **THEN** Cagnard SHALL reject or mark the listing as unsupported or degraded without returning misleading page-only results

## MODIFIED Requirements

### Requirement: Canonical storage operations
The plugin API SHALL define canonical operations for paginated listing, full recursive listing, stat, search, preview or bounded read, download, upload, create folder, rename, move, copy, delete, permission lookup, version lookup, retention lookup, encryption lookup, and transfer or file-opening content access.

#### Scenario: Register plugin with paginated listing support
- **WHEN** a plugin supports browser-facing paginated listing with provider-neutral cursors
- **THEN** Cagnard SHALL use that listing capability for file browser pages

#### Scenario: Keep full listing for recursive operations
- **WHEN** transfer planning or another backend operation needs a complete directory listing
- **THEN** Cagnard MAY use a separate full listing operation subject to provider limits and authorization

### Requirement: Provider limitation reporting
Storage plugins SHALL report operational limits that can affect correctness, performance, file opening, editing, browsing pagination, transfer, pasteboard copy/move, or user expectations.

#### Scenario: Report pagination and rate limits
- **WHEN** a provider requires paginated listing, limits page size, limits scanned pages, or applies rate limits
- **THEN** the plugin SHALL report those constraints so Cagnard can plan browsing, search, sorting, opening, and transfer behavior
