## MODIFIED Requirements

### Requirement: HOCON runtime configuration
Cagnard SHALL preserve HOCON as the primary backend runtime configuration format after the backend is rewritten in Go.

#### Scenario: Load existing HOCON files
- **WHEN** the Go backend starts with an existing Cagnard HOCON configuration file
- **THEN** it SHALL load the same server, auth, users, providers, accounts, storage roots, and UI plugin declarations as the Scala backend

#### Scenario: Preserve substitutions and includes
- **WHEN** a configuration uses supported HOCON comments, includes, environment substitutions, or system substitutions
- **THEN** the Go backend SHALL resolve the effective configuration compatibly with the Scala reference behavior or fail with an explicit compatibility diagnostic

#### Scenario: Preserve config path selection
- **WHEN** `CAGNARD_CONFIG`, the first backend argument, or the default example path selects the configuration file
- **THEN** the Go backend SHALL use the same precedence and path behavior as the Scala backend

### Requirement: Configuration diagnostics
Cagnard SHALL preserve operator-friendly configuration diagnostics in the Go backend.

#### Scenario: Invalid HOCON syntax
- **WHEN** the Go backend starts with invalid HOCON syntax
- **THEN** it SHALL fail startup with a diagnostic that names the configuration file and parse problem

#### Scenario: Invalid typed configuration
- **WHEN** the Go backend parses HOCON but cannot decode it to the Cagnard configuration model
- **THEN** it SHALL fail startup with a diagnostic that identifies the invalid setting

### Requirement: Stateless runtime model
Cagnard SHALL keep the backend stateless after the Go rewrite, with no required application database for startup or core requests.

#### Scenario: Restart Go backend
- **WHEN** the Go backend restarts with the same configuration
- **THEN** it SHALL recover the same configured providers, users, access policies, and UI plugin declarations without migrations or local persistent application state

#### Scenario: In-memory transfer jobs
- **WHEN** transfer jobs are stored in memory by the Go backend
- **THEN** Cagnard SHALL continue to document that active and recent jobs are lost on backend restart
