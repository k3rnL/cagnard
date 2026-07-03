## ADDED Requirements

### Requirement: Multi-provider browsing
Cagnard SHALL allow users to browse buckets, drives, folders, containers, directories, files, and objects across connected storage providers through one consistent browser experience.

#### Scenario: Browse across accounts and providers
- **WHEN** the user opens the storage browser with accounts connected for multiple providers
- **THEN** Cagnard SHALL show the available accounts and storage roots without requiring provider-specific navigation screens

#### Scenario: Open nested storage location
- **WHEN** the user opens a bucket, drive, container, folder, or directory
- **THEN** Cagnard SHALL list child entries using the provider plugin's listing capability

### Requirement: Multi-account support in navigation
Cagnard SHALL support multiple accounts per provider and make the active account context clear during browsing and operations.

#### Scenario: Display accounts from same provider
- **WHEN** the user connects two S3-compatible accounts
- **THEN** Cagnard SHALL display both accounts as separate selectable account contexts under the provider family

#### Scenario: Prevent ambiguous operation target
- **WHEN** the user starts an upload, rename, move, delete, or transfer operation
- **THEN** Cagnard SHALL include the source or destination account context in the operation target

### Requirement: Personal and global navigation areas
Cagnard SHALL display personal storage and global storage as separate navigation areas when both access tunnels are enabled for the user.

#### Scenario: Show personal storage area
- **WHEN** the user has one or more personal home storage roots
- **THEN** Cagnard SHALL show a personal navigation area such as "Home" or "My documents"

#### Scenario: Show global storage area
- **WHEN** the user has access to one or more global storage points
- **THEN** Cagnard SHALL show a global navigation area containing the accessible global storage points

#### Scenario: Hide disabled tunnel
- **WHEN** the user has no access through a personal or global storage tunnel
- **THEN** Cagnard SHALL not show the disabled tunnel as an empty primary navigation area

### Requirement: Capability-driven browser actions
Cagnard SHALL enable search, preview, download, upload, rename, move, and delete actions only when the selected provider, account, and storage entry expose the required capabilities.

#### Scenario: Enable available action
- **WHEN** a selected storage entry supports download and preview
- **THEN** Cagnard SHALL offer download and preview actions for that entry

#### Scenario: Disable unavailable action
- **WHEN** a selected storage entry does not support delete
- **THEN** Cagnard SHALL show delete as unavailable or omit it according to the UI policy

### Requirement: Search across storage providers
Cagnard SHALL support search through provider-native search when available and through clearly scoped fallback behavior when native search is unavailable.

#### Scenario: Use provider-native search
- **WHEN** the active provider exposes a native search capability
- **THEN** Cagnard SHALL execute search through that provider capability and show the provider and account scope of the results

#### Scenario: Explain limited search scope
- **WHEN** the active provider does not expose native search
- **THEN** Cagnard SHALL restrict search to an available fallback scope and identify that limitation to the user

### Requirement: File preview
Cagnard SHALL preview supported files and objects based on normalized metadata, content type, size limits, and provider download or preview capabilities.

#### Scenario: Preview supported MIME type
- **WHEN** the user previews an entry with a supported MIME type and accessible content
- **THEN** Cagnard SHALL render an appropriate preview without requiring the user to download the file manually

#### Scenario: Refuse unsafe or unsupported preview
- **WHEN** the entry is too large, has an unsupported MIME type, or lacks a safe preview capability
- **THEN** Cagnard SHALL decline inline preview and offer available alternative actions

### Requirement: Metadata comparison
Cagnard SHALL provide a normalized metadata view for size, MIME type, owner, permissions, version, retention, and encryption state across providers.

#### Scenario: Compare normalized metadata
- **WHEN** the user selects entries from different providers
- **THEN** Cagnard SHALL show comparable normalized metadata fields for each entry

#### Scenario: Show unavailable metadata explicitly
- **WHEN** a provider cannot supply a normalized metadata field
- **THEN** Cagnard SHALL display that field as unavailable rather than blank or false

### Requirement: Provider-neutral primary UI
Cagnard SHALL keep the primary browser workflow provider-neutral while allowing contextual access to provider-specific features.

#### Scenario: Avoid provider-specific primary controls
- **WHEN** the user browses mixed storage providers
- **THEN** Cagnard SHALL present common browser actions consistently and keep provider-specific actions in contextual extension surfaces

#### Scenario: Expose provider feature without clutter
- **WHEN** a selected provider exposes a feature that only applies to that provider
- **THEN** Cagnard SHALL expose the feature near the selected entry or account without changing unrelated provider views

### Requirement: Operation result feedback
Cagnard SHALL report the result of browser operations with enough detail to understand success, partial success, provider rejection, and capability limitation.

#### Scenario: Provider rejects operation
- **WHEN** a provider rejects an upload, rename, move, delete, or download operation
- **THEN** Cagnard SHALL show the canonical failure category and provider-specific diagnostic details when safe to display

#### Scenario: Operation succeeds
- **WHEN** a browser operation completes successfully
- **THEN** Cagnard SHALL refresh or update the affected storage location so the browser reflects the new state
