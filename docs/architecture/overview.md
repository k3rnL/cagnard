# Architecture Overview

Cagnard is a browser application over an abstract storage contract. The React frontend never talks directly to S3 or the host filesystem; it calls one Go HTTP backend that resolves identity, access, provider capabilities, and file operations from HOCON configuration.

```mermaid
flowchart LR
  Browser["React browser and file openers"] -->|"HTTP /api"| Backend["Stateless Go API"]
  Backend --> Auth["Identity and root authorization"]
  Backend --> Tasks["In-memory transfer tasks"]
  Backend --> Registry["Storage provider registry"]
  Registry --> FS["Unix filesystem"]
  Registry --> S3["S3-compatible storage"]
```

## Stateless Runtime

On startup, the backend parses one configuration into typed providers, accounts, users, roots, appearance defaults, and opener manifests. Requests authenticate a signed cookie or explicit development identity, resolve the current user against configuration, then filter roots by user, role, and group.

There is no application database. This makes deployment and backup simple, but active transfer jobs are an explicit exception: they are process-local and disappear on restart.

## Root Identity

A file location is not only a path. Every operation carries:

- tunnel (`personal` or `global`);
- storage root ID;
- provider and account resolved by the server;
- path relative to that root.

The browser URL stores readable navigation paths while API requests preserve root identity. Provider credentials and absolute filesystem paths remain server-side.

## Capability Negotiation

Providers expose supported, degraded, or unsupported capabilities. Roots and entries return that state to the frontend, which uses it to enable actions and select compatible file openers. This allows provider-specific strength without turning the entire UI into an S3 or filesystem UI.

See [Storage providers](storage-plugins.md) and the [capability reference](../reference/provider-capabilities.md).

## Data Paths

Small direct operations can use bounded buffers. Downloads, range-based viewers, and cross-provider transfers use stream or range interfaces when available. Recursive copy plans child entries, reports per-file progress, and applies conflict policy consistently below the selected directory.

## Extension Boundaries

Storage providers implement the server-side storage interface and advertise capabilities. File opener manifests map MIME types, extensions, categories, size strategies, and required capabilities to frontend rendering surfaces. Neither model gives browser code provider credentials.

The current registry is compiled into the application for provider implementations, while opener configuration extends selection among maintained rendering surfaces. These contracts leave room for stronger runtime plugin packaging later without making it a prerequisite for today's deployment.
