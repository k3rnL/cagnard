## Why

Cagnard now has a capable storage browser, but its placeholder identity, single hardcoded palette, and specification-oriented documentation make the project feel less mature and harder to adopt than the product itself. This change gives the application a coherent visual identity, accessible user-selectable themes, and a task-oriented project and documentation experience that gets users from discovery to a working Docker or Helm deployment quickly.

## What Changes

- Adopt the supplied Cagnard artwork as the application identity, with optimized repository assets for the sidebar, login screen, favicon, README banner, and documentation.
- Replace hardcoded UI colors with semantic design tokens and provide Classic and Solar palettes, each in light and dark modes, plus system color-scheme resolution.
- Let operators configure appearance defaults through stateless HOCON configuration while allowing browser-local user preference when policy permits it.
- Rewrite the project README as a concise product entry point with an Occitania reference, feature highlights, release and validation links, a real application screenshot, and short Docker and Helm paths.
- Reorganize `docs/` around user tasks and audiences: getting started, guides, operations, architecture, reference, and contributing.
- Add direct Docker and Helm getting-started guides that use maintained runnable examples and published release artifacts where appropriate.
- Refresh runnable examples and Helm values where necessary so documented commands and current plugin/configuration contracts work from a clean environment.
- Preserve OpenSpec as the engineering contract while keeping user-facing documentation free of internal spec-oriented navigation.

## Capabilities

### New Capabilities
- `application-branding-and-theming`: Application logo assets, favicon behavior, semantic theme tokens, palette and mode selection, operator defaults, browser-local preference, and accessible visual coverage.

### Modified Capabilities
- `feature-documentation`: Require an appealing project README, task-oriented documentation information architecture, real product imagery, audience-specific navigation, and traceable feature coverage without exposing internal spec structure as the primary reader experience.
- `stateless-backend-configuration`: Add optional appearance defaults and user-override policy to HOCON configuration without introducing persistent backend state.
- `runnable-example-catalog`: Make Docker examples suitable for the primary getting-started path and keep their commands, images, configuration, and plugin declarations aligned with released behavior.
- `deployment-packaging`: Provide a simple, documented Helm installation path from the published OCI chart with maintained starter values.

## Impact

- Frontend application shell, login screen, favicon metadata, theme initialization, appearance controls, and the full CSS color system.
- Backend configuration model and a safe public appearance configuration response used before authentication.
- New optimized branding assets, a generated README banner, and captured application screenshots.
- Root `README.md`, the complete `docs/` hierarchy, runnable example READMEs and configuration, and Helm example values.
- Tests and visual verification across both palettes, light and dark modes, login and authenticated screens, and desktop and constrained viewports.
