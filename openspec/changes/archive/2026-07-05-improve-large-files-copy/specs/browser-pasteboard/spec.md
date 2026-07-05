## MODIFIED Requirements

### Requirement: Paste into active destination
Cagnard SHALL paste selected pasteboard file and directory entries into the currently active storage root and current path.

#### Scenario: Start paste job
- **WHEN** the user invokes Paste or Move here from the pasteboard
- **THEN** Cagnard SHALL start a transfer job for selected pasteboard entries and show the job reference to the user

#### Scenario: Paste directory entry
- **WHEN** a selected pasteboard entry is a directory
- **THEN** Cagnard SHALL transfer it recursively through job planning when the source and destination expose the required listing, create-directory, read, and write capabilities

#### Scenario: Keep staged entries during running job
- **WHEN** a pasteboard job is running
- **THEN** Cagnard SHALL keep enough source context to let the user inspect or retry failed items without requiring the original tab state

### Requirement: Pasteboard result reporting
Cagnard SHALL report batch paste results with enough detail for success, partial success, and failure.

#### Scenario: Running batch result
- **WHEN** a pasteboard transfer job is queued or running
- **THEN** Cagnard SHALL show progress and allow the user to open the detailed transfer job view

#### Scenario: Partial batch result
- **WHEN** some pasteboard job tasks succeed and others fail
- **THEN** Cagnard SHALL show per-task results and keep enough source context to let the user retry failed items

#### Scenario: Completed move item
- **WHEN** an item pasted with Move here is copied, verified, and source deletion succeeds
- **THEN** Cagnard MAY remove that item from the pasteboard after reporting success
