# application-branding-and-theming Specification

## Purpose

Defines Cagnard's maintained brand identity, configurable visual themes, browser-local appearance preferences, and accessibility expectations.
## Requirements
### Requirement: Cagnard brand identity
Cagnard SHALL use maintained Cagnard logo assets consistently across the authenticated application shell, login screen, browser favicon, project README, and documentation imagery.

#### Scenario: Show application logo
- **WHEN** the login screen or authenticated sidebar is rendered
- **THEN** Cagnard SHALL show the recognizable filled Cagnard mark on a black rounded background instead of the placeholder letter mark

#### Scenario: Show browser favicon
- **WHEN** a browser loads the Cagnard frontend
- **THEN** the document SHALL expose an optimized favicon derived from the Cagnard mark that remains recognizable at favicon sizes

#### Scenario: Preserve reusable brand sources
- **WHEN** maintainers need the logo for a dark, light, transparent, small-icon, or editorial context
- **THEN** the repository SHALL contain optimized variants derived from maintained source artwork without requiring lossy extraction from a screenshot

### Requirement: Theme palette and mode matrix
Cagnard SHALL provide Classic and Solar visual palettes, each with light and dark modes, and SHALL support system color-scheme resolution.

#### Scenario: Use Classic light theme
- **WHEN** the Classic palette and light mode are active
- **THEN** Cagnard SHALL preserve the existing restrained green visual identity through semantic theme tokens

#### Scenario: Use Classic dark theme
- **WHEN** the Classic palette and dark mode are active
- **THEN** Cagnard SHALL render a dark derivative of the Classic palette with readable surfaces, controls, statuses, and content

#### Scenario: Use Solar themes
- **WHEN** the Solar palette is active in light or dark mode
- **THEN** Cagnard SHALL use neutral surfaces and an amber-to-orange accent family derived from the supplied Cagnard artwork

#### Scenario: Follow system mode
- **WHEN** the selected mode is system
- **THEN** Cagnard SHALL resolve light or dark mode from the browser color-scheme preference and react when that preference changes

### Requirement: Semantic visual tokens
Cagnard SHALL style application surfaces through semantic design tokens rather than palette-specific color literals distributed across components.

#### Scenario: Render common surfaces
- **WHEN** any supported palette and mode combination is active
- **THEN** the application shell, login form, tables, controls, menus, modals, drawers, toasts, task queue, pasteboard, metadata, and file opener chrome SHALL use the active semantic tokens

#### Scenario: Render specialized content
- **WHEN** syntax highlighting, structured data, logs, diffs, progress, warnings, success, or error states are rendered
- **THEN** Cagnard SHALL use theme-compatible semantic colors with sufficient distinction in every supported palette and mode

#### Scenario: Use native color scheme
- **WHEN** a light or dark mode is active
- **THEN** Cagnard SHALL expose the corresponding `color-scheme` so browser-native controls match the application

### Requirement: Appearance selection
Cagnard SHALL provide an accessible appearance control on both the login screen and authenticated application shell when user overrides are enabled.

#### Scenario: Select palette
- **WHEN** the user chooses Classic or Solar from the appearance control
- **THEN** Cagnard SHALL apply the selected palette without reloading or losing current browser state

#### Scenario: Select mode
- **WHEN** the user chooses light, dark, or system mode
- **THEN** Cagnard SHALL apply the resolved mode without reloading or losing current browser state

#### Scenario: Operator disables override
- **WHEN** configuration disallows user appearance overrides
- **THEN** Cagnard SHALL apply the operator defaults and hide or disable the appearance selector

### Requirement: Browser-local appearance preference
Cagnard SHALL persist user-selected appearance preferences in browser-local storage without requiring backend-local user state.

#### Scenario: Restore preference
- **WHEN** a user returns in the same browser and appearance overrides remain allowed
- **THEN** Cagnard SHALL restore the previously selected palette and mode

#### Scenario: Apply preference before rendering
- **WHEN** the frontend starts with a stored preference or system dark preference
- **THEN** Cagnard SHALL resolve the appearance before rendering the login or application shell so a contradictory theme does not visibly flash

#### Scenario: Invalid stored preference
- **WHEN** browser-local appearance data is malformed or references an unavailable theme
- **THEN** Cagnard SHALL discard or ignore it and use the configured default safely

### Requirement: Accessible themed interface
Every supported palette and mode SHALL preserve readable contrast, visible focus, non-color status cues, and usable interaction states.

#### Scenario: Navigate with keyboard
- **WHEN** a keyboard user moves focus through controls in any theme
- **THEN** the focused control SHALL have a clearly visible focus indication that is not hidden by the active surface color

#### Scenario: Distinguish semantic state
- **WHEN** success, warning, error, blocked, selected, disabled, or running state is shown
- **THEN** the state SHALL remain distinguishable through text, iconography, shape, or motion in addition to color

#### Scenario: Render constrained viewport
- **WHEN** the appearance selector is used on a constrained viewport
- **THEN** its palette and mode controls SHALL remain reachable without overlapping browser actions or storage content

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
