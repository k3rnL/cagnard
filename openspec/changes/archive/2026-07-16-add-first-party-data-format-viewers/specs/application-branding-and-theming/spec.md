## ADDED Requirements

### Requirement: Consistent themed control feedback
Cagnard SHALL apply coherent hover, expanded, active, disabled, and keyboard-focus feedback to shared interactive controls in every supported palette and mode.

#### Scenario: Hover a standard control
- **WHEN** a pointer hovers an enabled icon, primary-subtle, provider, toolbar, pagination, modal, pasteboard, transfer, or opener control
- **THEN** Cagnard SHALL use the active theme's accent border and compatible soft background or the control's semantic destructive or primary color without changing its dimensions

#### Scenario: Expand a grouped control
- **WHEN** a grouped action, appearance selector, or popover trigger is expanded
- **THEN** its visible boundary SHALL retain the same themed emphasis used for hover until the surface closes

#### Scenario: Open a primary action from an expanded group
- **WHEN** the primary action opens a dialog or another interaction surface while its grouped menu is expanded
- **THEN** Cagnard SHALL close the prior menu before presenting the new surface

#### Scenario: Use keyboard navigation
- **WHEN** a user reaches a control by keyboard
- **THEN** Cagnard SHALL preserve a visible theme-compatible focus indicator independent of hover state
