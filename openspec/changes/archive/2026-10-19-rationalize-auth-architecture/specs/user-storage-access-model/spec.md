## MODIFIED Requirements

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

### Requirement: Operation scoping by storage tunnel
Cagnard SHALL retain tunnel, provider, account, resolved root, canonical actor, and requested action in authorized operations and sanitized audit context. All execution paths SHALL use the centralized authorization service.

#### Scenario: Transfer from personal to global
- **WHEN** a principal transfers a file between personal and global storage
- **THEN** Cagnard SHALL check the required source/destination actions separately and include both scopes in the audit event

#### Scenario: Mutation inside personal storage
- **WHEN** a principal deletes a personal-storage file
- **THEN** Cagnard SHALL require delete permission on that resolved root rather than relying on global rights or personal classification
