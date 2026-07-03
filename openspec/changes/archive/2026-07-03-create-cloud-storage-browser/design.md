## Context

Cagnard starts from an empty repository with OpenSpec artifacts only. The product target is a modern cloud storage browser where storage is an abstract provider capability implemented by plugins, and where files can be browsed, previewed, manipulated, and transferred across heterogeneous providers.

The backend must be stateless: a valid configuration file plus external providers must be sufficient to run it. Authentication should primarily rely on external identity providers such as Keycloak/OIDC, with simple configured users available for smaller deployments. The frontend should start from Refine because it is familiar to the project owner and fits a data-heavy operational UI.

## Goals / Non-Goals

**Goals:**

- Establish a monorepo foundation with a Refine-based web app and a stateless backend.
- Define provider-neutral storage contracts for browse, metadata, operations, and transfers.
- Provide configuration-driven providers, accounts, users, access policies, personal home storage, global storage points, and plugin declarations.
- Implement Unix filesystem storage as the first concrete provider because it is local, testable, and exercises the same abstraction as cloud providers.
- Keep the backend free of required database state.
- Make both storage provider plugins and UI plugins explicit extension systems.
- Provide enough initial implementation to validate navigation, config loading, provider abstraction, and API contracts.

**Non-Goals:**

- Full S3, Google, Azure, WebDAV, or SFTP provider implementation in the first implementation pass.
- Full OIDC login UX in the first implementation pass.
- A general-purpose third-party plugin marketplace.
- Browser-side editing of arbitrary file formats.
- Guaranteed preservation of every provider-specific metadata field during transfer.

## Decisions

### Use Scala with tapir for the initial backend

The backend will start as a Scala service exposing HTTP/JSON APIs with tapir endpoint definitions. Scala/tapir fits the project owner's expertise and gives a strong typed API surface for a capability-heavy product where storage entries, provider limits, auth claims, and plugin manifests need clear contracts.

Alternative considered: Go. Go remains attractive for a small stateless binary, filesystem access, and streaming transfers. The trade-off is weaker fit with the project owner's preferred backend stack and less type-driven endpoint modeling than Scala/tapir.

### Use Refine with React and TypeScript for the frontend

The web app will use Refine as the admin/data application base, with React and TypeScript. Refine matches the expected UI shape: navigation, resources, data providers, auth provider integration, and dense operational screens.

Alternative considered: plain React/Vite. Plain React would be lighter, but it would require rebuilding application shell, routing, auth integration, and data access conventions that Refine already provides.

### Keep backend state external or derived

The backend will read configuration at startup and may support explicit reload later. Providers, accounts, personal/global storage points, configured users, OIDC issuers, UI plugins, and policy rules are derived from configuration. Secrets are references to environment variables, mounted files, or external identity tokens, not application database rows.

Audit output is emitted to configured sinks such as stdout, files, or external collectors. The backend does not require an audit database to operate.

### Model storage access as two independent tunnels

The access model has two independent user-facing tunnels:

- Personal storage: displayed as "Home" or "My documents", backed by one or more user-specific roots.
- Global storage: displayed as "Global" or a configured label, backed by admin-configured shared storage points filtered by rights.

Both can be enabled, either can be enabled alone, and neither is a special case of the other.

### Use capability-driven provider contracts

Each storage provider declares capabilities, constraints, and degraded operations. The browser, transfer engine, and UI plugin registry use these declarations before offering actions.

The initial concrete provider is Unix filesystem storage. S3-compatible, Google storage, Azure Blob, WebDAV, and SFTP are planned provider targets that must fit the same contract.

### Start with in-process first-party plugins, design for process isolation later

Initial storage providers and UI plugins are first-party modules registered by configuration. The contracts should not assume they live in-process forever: provider calls pass through the core authorization, credential, capability, and audit layers, so external process or RPC-based plugins can be added later.

### Use HTTP API contracts between frontend and backend

The frontend talks to the backend through versioned HTTP/JSON APIs. The API surface starts around:

- configuration/session discovery
- accessible storage navigation
- entry listing and metadata
- file operation requests
- preview preparation
- transfer planning and execution
- UI plugin manifest discovery

OpenAPI generation can be added after the initial route shape is stable.

## Risks / Trade-offs

- Broad provider scope could make the first implementation too thin -> start with Unix filesystem and contract tests before adding cloud SDKs.
- Stateless backend limits local convenience features such as saved sessions or persisted transfer queues -> keep runtime state ephemeral and require external queues only if later specs demand resumability across restarts.
- Configured users can become insecure if treated like enterprise identity -> keep them explicit, optional, and suitable for simple deployments only.
- UI plugins can expand the attack surface -> require declarations, permission checks, scoped file access, and no raw credential access.
- Scala/tapir introduces a heavier runtime and build than Go -> keep the backend modular and avoid unnecessary framework layers.
- Provider metadata cannot always be normalized perfectly -> represent unavailable fields explicitly and keep provider-specific fields namespaced.

## Migration Plan

This is a greenfield project, so migration is initial bootstrap:

1. Create the monorepo structure.
2. Add the backend service with config loading, auth model types, provider registry, filesystem provider, and basic storage APIs.
3. Add the Refine web app with navigation for personal and global storage areas.
4. Add UI plugin registry types and at least one built-in preview plugin path.
5. Add tests for config loading, access filtering, provider capabilities, and filesystem browsing.

Rollback is removing the generated scaffold or reverting the change before it is merged.

## Open Questions

- Whether the first Scala backend should remain on http4s Ember long term or switch server interpreters as streaming transfer requirements deepen.
- Whether transfer execution should remain synchronous for the MVP or use an external queue for long-running transfers.
- Which Google provider should be first: Google Drive or Google Cloud Storage.
- Whether external UI plugins should be packaged as npm modules, remote manifests, iframes, module federation, or another isolation strategy.
