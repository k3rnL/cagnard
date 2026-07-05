## MODIFIED Requirements

### Requirement: Capability-driven browser actions
Cagnard SHALL enable search, open, download, upload, create file, create folder, rename, add-to-pasteboard, paste-copy, paste-move, transfer-job actions, and delete actions only when the selected provider, account, storage entry, active destination, and registered UI capabilities expose the required capabilities.

#### Scenario: Enable paste into active destination
- **WHEN** the pasteboard has selected items and the active destination supports the required write capabilities
- **THEN** Cagnard SHALL enable Paste or Move here actions that start transfer jobs for the active location according to destination and source capabilities

#### Scenario: Enable transfer job action
- **WHEN** a transfer job can be canceled, retried, inspected, or cleaned up
- **THEN** Cagnard SHALL expose only the job actions valid for that job status and user permission

### Requirement: Operation result feedback
Cagnard SHALL report the result of browser operations with enough detail to understand success, partial success, provider rejection, transfer job progress, cancellation, and capability limitation.

#### Scenario: Transfer job starts
- **WHEN** a pasteboard copy or move starts a transfer job
- **THEN** Cagnard SHALL show the job status and provide a path to detailed progress instead of only showing a final toast

#### Scenario: Transfer job partially fails
- **WHEN** a transfer job has failed, canceled, or partial tasks
- **THEN** Cagnard SHALL show safe failure diagnostics, affected source and destination paths, and available retry or cleanup actions

#### Scenario: Transfer job succeeds
- **WHEN** a transfer job completes successfully
- **THEN** Cagnard SHALL refresh or update affected storage locations so the browser reflects the new state

### Requirement: Transfer job browser surface
Cagnard SHALL provide a browser UI surface for recent and active transfer jobs.

#### Scenario: Show active transfers
- **WHEN** one or more transfer jobs are queued or running
- **THEN** Cagnard SHALL show active job count, aggregate progress, and access to job details without blocking normal browsing

#### Scenario: Show transfer details
- **WHEN** the user opens a transfer job detail view
- **THEN** Cagnard SHALL show task phases, progress, source and destination context, current errors, and available actions
