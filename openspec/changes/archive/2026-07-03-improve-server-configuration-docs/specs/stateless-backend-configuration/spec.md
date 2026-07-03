## ADDED Requirements

### Requirement: HOCON runtime configuration
Cagnard SHALL use HOCON as the primary backend runtime configuration format while preserving configuration as the stateless source of truth.

#### Scenario: Start from HOCON configuration
- **WHEN** the backend starts with a valid HOCON configuration file
- **THEN** Cagnard SHALL load server, auth, users, providers, accounts, storage roots, and UI plugin declarations from that file without requiring application database state

#### Scenario: Use HOCON comments and includes
- **WHEN** the configuration uses HOCON comments or includes
- **THEN** Cagnard SHALL parse the effective resolved configuration before constructing the backend model

#### Scenario: Resolve environment or system substitutions
- **WHEN** the configuration contains supported HOCON substitutions for deployment-specific values
- **THEN** Cagnard SHALL resolve those values at startup or fail with explicit diagnostics

### Requirement: Canonical HOCON example
Cagnard SHALL provide a canonical HOCON example configuration for local development and operator onboarding.

#### Scenario: Default example path
- **WHEN** the backend starts without a config path argument or `CAGNARD_CONFIG`
- **THEN** Cagnard SHALL look for the canonical HOCON example configuration path

#### Scenario: Override config path
- **WHEN** `CAGNARD_CONFIG` or a backend argument provides a configuration path
- **THEN** Cagnard SHALL load that HOCON file instead of the default example

#### Scenario: Resolve relative storage paths
- **WHEN** a storage root path in the HOCON file is relative
- **THEN** Cagnard SHALL resolve it relative to the configuration file location

### Requirement: Configuration diagnostics
Cagnard SHALL report configuration parsing, resolution, and decoding failures with enough context for an operator to identify the file and invalid setting.

#### Scenario: Invalid HOCON syntax
- **WHEN** the backend starts with invalid HOCON syntax
- **THEN** Cagnard SHALL fail startup with a diagnostic that names the configuration file

#### Scenario: Invalid typed configuration
- **WHEN** the HOCON is syntactically valid but cannot decode to the backend configuration model
- **THEN** Cagnard SHALL fail startup with a diagnostic that names the configuration file and decode problem
