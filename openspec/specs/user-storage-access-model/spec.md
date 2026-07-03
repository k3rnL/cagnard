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
Cagnard SHALL support administrator-configured personal storage roots through explicit declarations, user-based path templates, auto volume declaration, or provider-side segmentation.

#### Scenario: Template-derived home path
- **WHEN** a home storage root uses a user claim or username path template
- **THEN** Cagnard SHALL resolve the user's personal root from the authenticated identity and configured template

#### Scenario: Provider segmentation
- **WHEN** a provider exposes per-user storage through segmentation rules
- **THEN** Cagnard SHALL access only the user's configured segment for the personal storage tunnel

### Requirement: Global storage points
Cagnard SHALL support administrator-configured global storage points that users can access according to their rights.

#### Scenario: Display authorized global storage
- **WHEN** the administrator configures multiple global storage points and the user is authorized for some of them
- **THEN** Cagnard SHALL show only the authorized storage points under the global navigation entry

#### Scenario: Hide unauthorized global storage
- **WHEN** the user lacks rights for a global storage point
- **THEN** Cagnard SHALL hide or deny that storage point according to configured policy

### Requirement: Storage tunnel labels
Cagnard SHALL let administrators configure user-facing labels for personal and global storage areas while preserving canonical tunnel semantics.

#### Scenario: Configure personal label
- **WHEN** the administrator labels personal storage as "My documents"
- **THEN** Cagnard SHALL display that label while treating the area as the personal storage tunnel

#### Scenario: Configure global label
- **WHEN** the administrator labels global storage as "Global"
- **THEN** Cagnard SHALL display that label while treating the area as the global storage tunnel

### Requirement: Operation scoping by storage tunnel
Cagnard SHALL include the storage tunnel, provider, account, and resolved root in every browse, mutation, and transfer operation.

#### Scenario: Transfer from personal to global
- **WHEN** the user transfers a file from personal storage to a global storage point
- **THEN** Cagnard SHALL evaluate rights for both tunnels and include both scopes in the transfer audit event

#### Scenario: Mutation inside personal storage
- **WHEN** the user deletes a file from personal storage
- **THEN** Cagnard SHALL authorize the operation against the personal storage root and not against unrelated global storage rights

### Requirement: UI navigation for storage tunnels
Cagnard SHALL present personal and global storage tunnels as separate primary navigation areas when both are enabled.

#### Scenario: Home navigation with submenus
- **WHEN** personal storage has more than one configured home root
- **THEN** Cagnard SHALL show those roots as submenus or equivalent child navigation under the personal storage area

#### Scenario: Global navigation with accessible points
- **WHEN** global storage is enabled for the user
- **THEN** Cagnard SHALL show accessible global storage points under the global storage area
