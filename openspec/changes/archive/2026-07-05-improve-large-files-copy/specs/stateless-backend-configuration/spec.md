## MODIFIED Requirements

### Requirement: Configuration as runtime source of truth
Cagnard SHALL run the backend with configuration and external providers as the required source of runtime state, without requiring an application database to start or serve requests.

#### Scenario: Start with in-memory transfer jobs
- **WHEN** no external transfer job store is configured
- **THEN** Cagnard SHALL still start and run transfer jobs using in-memory state with documented restart limitations

#### Scenario: Configure external transfer job store
- **WHEN** an administrator configures an external transfer job store
- **THEN** Cagnard SHALL use that store for job recovery, retention, and multi-replica coordination according to the configured store guarantees

### Requirement: Stateless request handling
Cagnard SHALL avoid storing required user, session, provider, or access-control state in backend-local persistent storage.

#### Scenario: Restart during in-memory transfer
- **WHEN** the backend restarts while using in-memory transfer jobs
- **THEN** Cagnard SHALL lose active job runtime state and SHALL document that limitation in health, diagnostics, or transfer job configuration

#### Scenario: Scale transfer-capable replicas
- **WHEN** multiple backend replicas run with transfer jobs enabled
- **THEN** Cagnard SHALL either require an external job store/coordination mechanism or clearly mark in-memory job execution as single-replica only

### Requirement: HOCON runtime configuration
Cagnard SHALL use HOCON as the primary backend runtime configuration format while preserving configuration as the stateless source of truth.

#### Scenario: Configure transfer engine
- **WHEN** transfer engine settings are present in HOCON
- **THEN** Cagnard SHALL load concurrency, chunk size, multipart threshold, retry policy, buffered fallback limit, job retention, and persistence settings from that configuration

#### Scenario: Reject invalid transfer settings
- **WHEN** transfer engine settings are invalid or unsafe
- **THEN** Cagnard SHALL fail startup or disable transfer jobs with explicit configuration diagnostics
