## Why

Cagnard's backend configuration is currently JSON, which is workable for examples but awkward for real deployments that need comments, includes, environment substitution, and layered overrides. The project also needs a durable documentation habit so implemented specs and user-facing features remain discoverable as the system grows.

## What Changes

- Replace the backend runtime configuration format with HOCON as the primary supported format.
- Provide a HOCON example configuration that covers server binding, auth, users, providers, accounts, storage roots, and UI plugins.
- Keep backend operation stateless: configuration and external providers remain the source of runtime state.
- Add a project documentation structure that is maintained alongside specs and features.
- Document each feature/spec area with user-facing behavior, configuration notes, operational constraints, and known limitations.
- Update README entry points to link to the new documentation.
- **BREAKING**: JSON configuration will no longer be the canonical example/runtime format after migration; deployments should move to HOCON.

## Capabilities

### New Capabilities
- `feature-documentation`: Maintained documentation for implemented specs and feature areas, including feature behavior, configuration, operational notes, and limitations.

### Modified Capabilities
- `stateless-backend-configuration`: Backend configuration uses HOCON as the primary runtime format while preserving stateless startup and operation.

## Impact

- Backend configuration loader and dependencies.
- Example configuration files under `config/`.
- README and new documentation files under a project documentation directory.
- Tests for configuration loading, invalid configuration diagnostics, and HOCON-specific features such as comments, includes, and environment substitution where appropriate.
- Operator workflow for starting the server with `CAGNARD_CONFIG` or a config path argument.
