## Why

Cagnard needs a provider-neutral storage browser that treats storage as an abstract capability rather than a hardcoded cloud integration. This enables users to browse, manage, and transfer files across heterogeneous providers while keeping security, provider limitations, and feature differences explicit.

## What Changes

- Introduce a storage abstraction implemented by provider plugins.
- Support browsing buckets, drives, folders, containers, and objects across providers.
- Support search, preview, download, upload, rename, move, delete, and cross-provider transfers when providers expose the required capabilities.
- Normalize comparable metadata across providers: size, MIME type, owner, permissions, version, retention, and encryption state.
- Support multiple accounts per provider.
- Expose provider-specific features through capability discovery without making the primary UI provider-specific.
- Include first provider targets for S3-compatible storage, Google Drive or Google Cloud Storage, Azure Blob Storage, WebDAV/SFTP, and Unix filesystem storage.
- Run the backend as a stateless service whose required runtime state comes from configuration and external providers rather than an application database.
- Support authentication through external identity providers such as Keycloak or other OIDC providers, with optional simple user declarations in configuration for smaller deployments.
- Support two independent user storage access tunnels: personal "Home" or "My documents" storage and admin-configured global storage points.
- Make the frontend extensible by UI plugins, including plugins for previewing or manipulating exotic file formats.
- Use Refine as the initial frontend base unless later design work rejects it for a concrete reason.
- Resolve the backend runtime choice during design, with Scala/tapir and Go as primary candidates.

## Capabilities

### New Capabilities

- `storage-plugin-system`: Defines storage as a plugin-implemented abstraction, capability discovery, provider feature exposure, and the initial provider set.
- `storage-browser`: Defines browsing, search, preview, object operations, metadata comparison, provider-neutral UI behavior, and multi-account navigation.
- `cross-provider-transfer`: Defines transfers between storage implementations, capability negotiation, copy/move semantics, progress, retry, and provider limitation handling.
- `secure-account-management`: Defines account registration, credential handling, multi-account support, permission boundaries, and audit expectations for sensitive operations.
- `stateless-backend-configuration`: Defines configuration-only backend operation, external authentication, simple config users, and constraints on persistent backend state.
- `user-storage-access-model`: Defines personal home storage, global storage points, rights filtering, and user-facing navigation between these independent access tunnels.
- `ui-plugin-system`: Defines frontend plugin extension points for previews, file manipulation, contextual actions, and provider or format-specific UI contributions.

### Modified Capabilities

- None.

## Impact

- Establishes the initial product contract for Cagnard before implementation.
- Affects future frontend architecture, likely starting from Refine.
- Affects future backend architecture, plugin host design, storage APIs, stateless configuration format, external authentication integration, transfer engine, audit logging, and provider SDK dependencies.
- Requires implementation work to preserve provider-specific advantages while keeping the core file-management experience provider-neutral.
