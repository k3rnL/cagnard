## ADDED Requirements

### Requirement: Feature documentation inventory
Cagnard SHALL maintain documentation for each implemented spec or feature area so users, operators, and contributors can understand behavior without reading implementation code.

#### Scenario: Document implemented feature area
- **WHEN** a spec or feature area is implemented
- **THEN** Cagnard SHALL provide a documentation page that describes behavior, configuration, operational constraints, and known limitations

#### Scenario: Link documentation from index
- **WHEN** a feature documentation page exists
- **THEN** Cagnard SHALL link it from a documentation index reachable from the project README

### Requirement: Documentation update discipline
Cagnard SHALL update feature documentation in the same change that adds or changes implemented feature behavior.

#### Scenario: Feature behavior changes
- **WHEN** a change modifies implemented behavior for a spec or feature area
- **THEN** the change SHALL update the corresponding feature documentation before the change is archived

#### Scenario: New feature area
- **WHEN** a change introduces a new implemented feature area
- **THEN** the change SHALL add a new documentation page and link it from the documentation index

### Requirement: Configuration documentation
Cagnard SHALL document backend configuration format, default paths, override mechanisms, and example deployment settings.

#### Scenario: Document HOCON configuration
- **WHEN** an operator reads the configuration documentation
- **THEN** it SHALL identify HOCON as the primary configuration format and show how to start the backend with a config path

#### Scenario: Document known limitations
- **WHEN** a feature has incomplete provider support, prototype limitations, or operational caveats
- **THEN** the corresponding documentation SHALL state those limitations explicitly
