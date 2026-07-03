## 1. Project Bootstrap

- [x] 1.1 Create repository-level documentation, ignore rules, and a sample stateless configuration file.
- [x] 1.2 Scaffold the Scala/tapir backend module and executable entry point.
- [x] 1.3 Scaffold the Refine React frontend package.

## 2. Backend Core

- [x] 2.1 Implement configuration loading for providers, accounts, users, OIDC providers, personal storage, global storage, and UI plugins.
- [x] 2.2 Implement stateless user resolution for configured users and bearer-token/OIDC claim placeholders.
- [x] 2.3 Implement access filtering for personal home roots and global storage points.
- [x] 2.4 Implement the storage provider registry and capability model.
- [x] 2.5 Implement the Unix filesystem storage provider for list and stat operations.
- [x] 2.6 Implement HTTP APIs for health, session discovery, storage navigation, entry listing, and plugin manifests.

## 3. Frontend Core

- [x] 3.1 Implement frontend API client types for session, navigation, entries, and UI plugins.
- [x] 3.2 Implement the Refine application shell with personal and global storage navigation.
- [x] 3.3 Implement a storage browser view with provider-neutral listing and metadata display.
- [x] 3.4 Implement an initial UI plugin registry with a built-in text preview extension path.

## 4. Verification

- [x] 4.1 Add backend tests for config loading, access filtering, provider capabilities, and Unix filesystem listing.
- [x] 4.2 Add frontend type-check/build scripts and verify the scaffold compiles where dependencies are available.
- [x] 4.3 Validate the OpenSpec change after implementation.
