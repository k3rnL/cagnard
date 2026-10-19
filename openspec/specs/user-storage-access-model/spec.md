## Purpose

Defines personal and global storage tunnels, rights filtering, and user-facing navigation.
## Requirements
### Requirement: Independent personal and global storage tunnels
Cagnard SHALL model personal storage access and global storage access as independent user-facing storage tunnels that can be enabled together or separately.

#### Scenario: Only personal storage enabled
- **WHEN** a user has personal storage access and no global storage access
- **THEN** Cagnard SHALL show the personal storage area and SHALL not show a global storage menu

#### Scenario: Only global storage enabled
- **WHEN** a user has global storage access and no personal storage access
- **THEN** Cagnard SHALL show the global storage area and SHALL not show a personal storage area

#### Scenario: Both tunnels enabled
- **WHEN** a user has both personal and global storage access
- **THEN** Cagnard SHALL show both storage areas as separate navigation entries

### Requirement: Personal home storage
Cagnard SHALL support a personal "Home" or "My documents" storage area backed by one or more configured home storage providers.

#### Scenario: Single home directory
- **WHEN** the user has one configured home storage root
- **THEN** Cagnard SHALL expose it under a personal storage navigation entry such as "Home" or "My documents"

#### Scenario: Multiple home directories
- **WHEN** the user has multiple configured home storage roots
- **THEN** Cagnard SHALL expose them as submenus or child entries under the personal storage navigation entry

### Requirement: Personal storage provisioning modes
Cagnard SHALL support administrator-declared personal roots with explicit targets or validated principal storage-key templates, including filesystem paths and S3 prefixes. Personal classification SHALL NOT itself grant access or imply user isolation.

#### Scenario: Template-derived home path
- **WHEN** an authorized personal root contains the principal storage-key template
- **THEN** Cagnard SHALL resolve it using the validated key while preserving confinement to the configured base

#### Scenario: Provider segmentation
- **WHEN** a personal S3 root uses the principal storage-key template in its prefix
- **THEN** Cagnard SHALL scope access to the resolved segment under the configured prefix

#### Scenario: Personal root without a grant
- **WHEN** a root is personal but no binding grants the principal access
- **THEN** Cagnard SHALL deny that root regardless of its path template

### Requirement: Global storage points
Cagnard SHALL expose administrator-configured global roots according to centralized scoped role bindings and effective actions. Visibility SHALL NOT imply list permission; every operation SHALL require its own action.

#### Scenario: Display authorized global storage
- **WHEN** a principal has effective actions on some configured global roots
- **THEN** navigation SHALL show those roots with their effective action sets

#### Scenario: Hide unauthorized global storage
- **WHEN** the principal has no effective actions on a root
- **THEN** navigation SHALL omit it and direct access SHALL return not found

#### Scenario: Write-only root
- **WHEN** a principal has write permission but no list permission on a visible root
- **THEN** authorized writes SHALL remain possible while directory listing SHALL be denied

### Requirement: Storage tunnel labels
Cagnard SHALL let administrators configure user-facing labels for personal and global storage areas while preserving canonical tunnel semantics.

#### Scenario: Configure personal label
- **WHEN** the administrator labels personal storage as "My documents"
- **THEN** Cagnard SHALL display that label while treating the area as the personal storage tunnel

#### Scenario: Configure global label
- **WHEN** the administrator labels global storage as "Global"
- **THEN** Cagnard SHALL display that label while treating the area as the global storage tunnel

### Requirement: Operation scoping by storage tunnel
Cagnard SHALL retain tunnel, provider, account, resolved root, canonical actor, and requested action in authorized operations and sanitized audit context. All execution paths SHALL use the centralized authorization service.

#### Scenario: Transfer from personal to global
- **WHEN** a principal transfers a file between personal and global storage
- **THEN** Cagnard SHALL check the required source/destination actions separately and include both scopes in the audit event

#### Scenario: Mutation inside personal storage
- **WHEN** a principal deletes a personal-storage file
- **THEN** Cagnard SHALL require delete permission on that resolved root rather than relying on global rights or personal classification

### Requirement: UI navigation for storage tunnels
Cagnard SHALL present personal and global storage tunnels as separate primary navigation areas when both are enabled.

#### Scenario: Home navigation with submenus
- **WHEN** personal storage has more than one configured home root
- **THEN** Cagnard SHALL show those roots as submenus or equivalent child navigation under the personal storage area

#### Scenario: Global navigation with accessible points
- **WHEN** global storage is enabled for the user
- **THEN** Cagnard SHALL show accessible global storage points under the global storage area
