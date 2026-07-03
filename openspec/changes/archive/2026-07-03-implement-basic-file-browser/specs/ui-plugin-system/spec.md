## ADDED Requirements

### Requirement: Text preview rendering
Cagnard SHALL connect registered text preview plugins to backend-provided text preview content for supported files.

#### Scenario: Render text preview
- **WHEN** the selected file matches a registered text preview plugin and backend preview content is available
- **THEN** Cagnard SHALL render the text content in the preview area

#### Scenario: Preview content unavailable
- **WHEN** the selected file matches a preview plugin but backend preview content is unavailable
- **THEN** Cagnard SHALL show a preview failure message without blocking other file actions
