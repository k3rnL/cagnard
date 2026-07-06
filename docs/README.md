# Cagnard Documentation

This directory is the maintained documentation surface for implemented Cagnard features.

Feature documentation is organized by spec area:

- [Go backend runtime](features/go-backend-runtime.md)
- [Stateless backend configuration](features/stateless-backend-configuration.md)
- [User login flow](features/user-login-flow.md)
- [Storage browser](features/storage-browser.md)
- [Browser feedback and notifications](features/browser-feedback-and-notifications.md)
- [Browser action modals](features/browser-action-modals.md)
- [Browser pasteboard](features/browser-pasteboard.md)
- [File compatibility](features/file-compatibility.md)
- [Storage plugin system](features/storage-plugin-system.md)
- [Secure account management](features/secure-account-management.md)
- [User storage access model](features/user-storage-access-model.md)
- [UI plugin system](features/ui-plugin-system.md)
- [Cross-provider transfer](features/cross-provider-transfer.md)
- [Deployment packaging](features/deployment-packaging.md)
- [Runnable example catalog](features/runnable-example-catalog.md)
- [CI and release automation](features/ci-release-automation.md)
- [Feature documentation](features/feature-documentation.md)

Operational guides:

- [Backend configuration](configuration.md)

## Maintenance Rule

Every change that adds or changes implemented behavior must update the matching feature documentation in this directory before the OpenSpec change is archived. If a change creates a new feature/spec area, add a new page under `docs/features/` and link it from this index.

Changes that add storage providers or authentication methods must also update runnable examples when they affect how users start or configure Cagnard.
