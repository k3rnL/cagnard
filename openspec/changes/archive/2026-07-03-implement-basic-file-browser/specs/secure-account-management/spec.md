## ADDED Requirements

### Requirement: Mutation authorization enforcement
Cagnard SHALL enforce account read-only state and configured operation policy before executing file upload, create folder, rename, delete, copy, or move operations.

#### Scenario: Block upload on read-only account
- **WHEN** the active account is read-only and the user uploads a file
- **THEN** Cagnard SHALL reject the operation before invoking the provider write

#### Scenario: Block delete on read-only account
- **WHEN** the active account is read-only and the user requests delete
- **THEN** Cagnard SHALL reject the operation before invoking provider delete

#### Scenario: Allow mutation on writable account
- **WHEN** the active account is writable and the user is authorized for the storage root
- **THEN** Cagnard SHALL allow the provider operation to run subject to provider capability checks

### Requirement: Destructive operation confirmation signal
Cagnard SHALL require the frontend or API caller to send an explicit confirmation signal for delete and overwrite operations.

#### Scenario: Missing delete confirmation
- **WHEN** a delete request does not include confirmation
- **THEN** Cagnard SHALL reject the request without deleting the entry

#### Scenario: Missing overwrite approval
- **WHEN** an upload, copy, or move would overwrite an existing target without overwrite approval
- **THEN** Cagnard SHALL reject the operation without modifying the target
