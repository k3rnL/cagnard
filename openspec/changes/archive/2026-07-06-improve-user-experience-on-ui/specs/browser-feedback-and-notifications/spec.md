## ADDED Requirements

### Requirement: Toast notifications
Cagnard SHALL show transient success, warning, and error feedback in a toaster-style notification surface outside the file list layout.

#### Scenario: Show operation success
- **WHEN** a browser operation succeeds and user feedback is useful
- **THEN** Cagnard SHALL show a toast notification without inserting a message above or inside the file list

#### Scenario: Show operation error
- **WHEN** a browser operation fails
- **THEN** Cagnard SHALL show a toast notification with a safe, actionable error message without shifting file rows

#### Scenario: Avoid accidental row click
- **WHEN** a notification appears, disappears, or is dismissed
- **THEN** Cagnard SHALL NOT move the file list in a way that can turn the user's click into an unintended file or directory open

#### Scenario: Dismiss notification
- **WHEN** the user dismisses a toast
- **THEN** Cagnard SHALL remove that toast without changing selection, navigation, or opener state

#### Scenario: Multiple notifications
- **WHEN** multiple operations produce feedback close together
- **THEN** Cagnard SHALL stack or replace notifications predictably without covering primary browser controls for normal desktop and mobile viewports

### Requirement: Feedback accessibility
Cagnard SHALL make toast notifications perceivable and usable for keyboard and assistive-technology users.

#### Scenario: Announce error
- **WHEN** an error toast appears
- **THEN** Cagnard SHALL expose the message through an appropriate live region or equivalent accessibility mechanism

#### Scenario: Keep focus stable
- **WHEN** a toast appears
- **THEN** Cagnard SHALL NOT steal keyboard focus from the active browser, modal, or opener control

#### Scenario: Keyboard dismissal
- **WHEN** a toast is focusable or has an explicit dismissal control
- **THEN** Cagnard SHALL allow keyboard users to dismiss it
