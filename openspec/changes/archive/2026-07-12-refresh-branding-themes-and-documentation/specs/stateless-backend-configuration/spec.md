## ADDED Requirements

### Requirement: Stateless appearance configuration
Cagnard SHALL support optional application appearance defaults through HOCON configuration without requiring persistent backend state.

#### Scenario: Use default appearance configuration
- **WHEN** no appearance section is configured
- **THEN** Cagnard SHALL default to the Classic palette, system mode, and enabled user overrides

#### Scenario: Configure appearance defaults
- **WHEN** an administrator configures a supported default palette and mode
- **THEN** Cagnard SHALL expose those defaults to the frontend for the login screen and authenticated application shell

#### Scenario: Configure user override policy
- **WHEN** an administrator disables user appearance overrides
- **THEN** Cagnard SHALL expose the configured palette and mode as locked frontend appearance settings

#### Scenario: Reject invalid appearance values
- **WHEN** the configured palette or mode is not supported
- **THEN** Cagnard SHALL fail startup with a diagnostic that identifies the invalid appearance setting

### Requirement: Public appearance discovery
Cagnard SHALL expose only non-sensitive appearance configuration through an unauthenticated discovery response so the login screen can apply operator defaults.

#### Scenario: Load appearance before login
- **WHEN** the frontend starts without an authenticated session
- **THEN** it SHALL be able to retrieve default palette, default mode, and user-override policy without receiving users, credentials, storage roots, or other protected configuration

#### Scenario: Restart with same appearance
- **WHEN** stateless backend replicas restart with the same HOCON configuration
- **THEN** each replica SHALL return the same appearance discovery response without shared application state
