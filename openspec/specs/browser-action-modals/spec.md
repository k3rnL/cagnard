## Purpose

Defines app-owned modal behavior for browser actions that need input, confirmation, conflict resolution, or detailed user feedback.

## Requirements

### Requirement: App-owned browser action modals
Cagnard SHALL use normalized app-owned modal components for browser actions that require confirmation, text input, conflict choice, or detailed error presentation.

#### Scenario: Replace native action dialog
- **WHEN** a browser action requires user input or confirmation
- **THEN** Cagnard SHALL render an in-app modal instead of using native `alert`, `confirm`, or `prompt`

#### Scenario: Show action context
- **WHEN** the modal is opened for a selected file, directory, or batch of entries
- **THEN** the modal SHALL show the operation name and enough target context to avoid ambiguous mutations

### Requirement: Modal accessibility and focus behavior
Cagnard SHALL make browser action modals keyboard accessible and SHALL preserve predictable focus behavior.

#### Scenario: Open modal
- **WHEN** a modal opens
- **THEN** focus SHALL move into the modal and keyboard navigation SHALL remain inside the modal until it closes

#### Scenario: Close modal
- **WHEN** a modal closes
- **THEN** focus SHALL return to the control or browser surface that opened it when that element still exists

#### Scenario: Escape handling
- **WHEN** the user presses Escape in a dismissible modal
- **THEN** Cagnard SHALL close the modal without executing the action

### Requirement: Modal validation
Cagnard SHALL validate modal input before submitting browser operations.

#### Scenario: Invalid name
- **WHEN** the user submits a create or rename modal with an empty, invalid, or unsafe name
- **THEN** Cagnard SHALL keep the modal open and show an inline validation message

#### Scenario: Pending operation
- **WHEN** a modal-submitted operation is running
- **THEN** Cagnard SHALL prevent duplicate submission and show progress or pending state in the modal or command surface

### Requirement: Destructive action confirmation
Cagnard SHALL require an app-owned confirmation modal before destructive browser actions execute.

#### Scenario: Delete selected entries
- **WHEN** the user requests deletion of one or more selected entries
- **THEN** Cagnard SHALL show a confirmation modal with item count and representative names before deleting

#### Scenario: Cancel destructive action
- **WHEN** the user cancels the destructive confirmation
- **THEN** Cagnard SHALL leave all selected entries unchanged

### Requirement: Responsive modal layout
Cagnard SHALL keep action modals usable on desktop, tablet, and mobile viewport widths.

#### Scenario: Small viewport modal
- **WHEN** the viewport is too narrow for a centered desktop dialog
- **THEN** the modal SHALL fit within the viewport and keep primary and secondary actions reachable

### Requirement: File conflict modal
Cagnard SHALL resolve pasteboard destination conflicts through a normalized app-owned modal that follows common file-browser behavior.

#### Scenario: Ask on first conflict
- **WHEN** a pasteboard transfer detects a destination entry with the same name
- **THEN** Cagnard SHALL ask the user how to resolve the conflict before overwriting or skipping that item

#### Scenario: Offer standard conflict choices
- **WHEN** a conflict can be resolved by multiple strategies
- **THEN** Cagnard SHALL offer Replace when overwrite is supported, Skip, and Keep Both through automatic renaming when supported

#### Scenario: Apply conflict choice to batch
- **WHEN** the user selects a conflict strategy for a batch paste
- **THEN** Cagnard SHALL allow applying that choice to remaining conflicts in the same batch

#### Scenario: Non-destructive default
- **WHEN** the conflict modal opens
- **THEN** the default focused action SHALL be non-destructive, such as Keep Both, Skip, or Cancel
