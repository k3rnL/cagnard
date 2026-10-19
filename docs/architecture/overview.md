# Architecture Overview

Cagnard is a browser application over an abstract storage contract. The React frontend never talks directly to S3 or the host filesystem; it calls one Go HTTP backend that resolves identity, access, provider capabilities, and file operations from HOCON configuration.

```mermaid
flowchart LR
  Browser["React browser and file openers"] -->|"HTTP /api"| Backend["Go HTTP API"]
  Backend --> Auth["Identity and root authorization"]
  Backend --> Tasks["In-memory background tasks"]
  Backend --> Registry["Storage provider registry"]
  Registry --> FS["Unix filesystem"]
  Registry --> S3["S3-compatible storage"]
```

## Configuration and runtime state

On startup, the backend parses one configuration into typed providers, accounts, users, roots, and appearance defaults. Requests authenticate protected session evidence or an explicit local development identity, resolve a provider-qualified principal, and apply declared action bindings and storage ceilings. See the [authentication architecture](authentication.md) and its linked model references.

There is no application database. Configuration and provider data need their own backups. Active copy, move, delete, download, and upload tasks live in process memory and disappear on restart; see [task durability and replica limits](tasks.md#configuration-and-durability).

## Root Identity

A file location is not only a path. Every operation carries:

- tunnel (`personal` or `global`);
- storage root ID;
- provider and account resolved by the server;
- path relative to that root.

The browser URL stores readable navigation paths while API requests preserve root identity. Provider credentials and absolute filesystem paths remain server-side.

## Capability Negotiation

Authorization decides which actions this user may perform on a root; capabilities describe whether the storage implementation supports them. Both matter.

Providers expose supported, degraded, or unsupported capabilities. Roots and entries return that state to the frontend, which uses it to enable actions and select compatible file openers. This allows provider-specific strength without turning the entire UI into an S3 or filesystem UI.

See [Storage providers](storage-plugins.md) and the [capability reference](../reference/provider-capabilities.md).

## Data Paths

Small direct operations can use bounded buffers. Downloads, uploads, range-based viewers, and cross-provider transfers use stream or range interfaces when available. Recursive copy, move, and delete report child entries through the common task queue; streamed downloads and browser-fed uploads use the same lifecycle and cancellation model.

## Browser demo

The [public browser demo](https://k3rnl.github.io/cagnard/) runs the Go API as WebAssembly in a service worker. Its HTTP storage provider reads a public static corpus; it has no private filesystem or S3 account. The demo login demonstrates the UI and does not make the published files private.

```mermaid
flowchart LR
  UI["Browser UI"] --> API["Go API in service worker"]
  API --> Corpus["Public static sample files"]
```

This is a separate deployment mode from the server architecture above. See [Docker](../getting-started/docker.md) or [Helm](../getting-started/helm.md) for private storage.

## Extension Boundaries

Storage providers implement the server-side storage interface and advertise capabilities. A typed first-party registry maps MIME types, extensions, categories, size strategies, and required capabilities to lazy frontend rendering surfaces. Neither model gives browser code provider credentials.

Both provider implementations and file openers are currently compiled into the application. Specialized structured-data readers run in a worker and use authorized Cagnard content URLs. A future executable plugin system would need an explicit packaging, versioning, trust, and isolation design; the removed manifest-only frontend contract is not retained as a public API.
