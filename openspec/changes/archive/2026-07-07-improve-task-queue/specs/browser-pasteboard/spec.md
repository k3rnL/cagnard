## MODIFIED Requirements

### Requirement: Pasteboard dropdown
Cagnard SHALL expose pasteboard contents through a command-bar dropdown or popover.

#### Scenario: Show pasteboard entries
- **WHEN** the user opens the pasteboard dropdown
- **THEN** Cagnard SHALL show staged entries with name, type, source provider/root/path context, selected state, and paste or move availability

#### Scenario: Manage pasteboard entries
- **WHEN** the pasteboard dropdown is open
- **THEN** the user SHALL be able to clear all entries, remove one entry, and select or deselect entries for paste

#### Scenario: Long pasteboard actions remain available
- **WHEN** the pasteboard dropdown contains enough entries to scroll
- **THEN** Cagnard SHALL keep the clear, paste, and move actions accessible at the bottom of the dropdown

#### Scenario: Close dropdown
- **WHEN** the user clicks outside the pasteboard dropdown
- **THEN** Cagnard SHALL close the dropdown without clearing its entries

#### Scenario: Remove selected entries when transfer starts
- **WHEN** the user starts Paste or Move here from selected pasteboard entries
- **THEN** Cagnard SHALL remove those selected entries from the pasteboard immediately after the task is accepted

### Requirement: Pasteboard result reporting
Cagnard SHALL report batch paste results with enough detail for success, partial success, and failure through the task queue once a pasteboard transfer task has been accepted.

#### Scenario: Running batch result
- **WHEN** a pasteboard copy or move task is pending, blocked, or running
- **THEN** Cagnard SHALL show progress and decisions through the task queue rather than requiring the original pasteboard entries to remain staged

#### Scenario: Partial batch result
- **WHEN** some pasteboard task items succeed and others fail
- **THEN** Cagnard SHALL show per-item results through expandable task details and keep enough source context in the task to let the user understand failed items

#### Scenario: Completed move item
- **WHEN** an item pasted with Move here is copied, verified, and source deletion succeeds
- **THEN** Cagnard SHALL report that item as completed in the task details
