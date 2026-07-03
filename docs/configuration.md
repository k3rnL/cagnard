# Backend Configuration

Cagnard's backend is stateless. Providers, accounts, users, access rules, storage roots, and UI plugin declarations are loaded from configuration and external providers at startup.

## Format

The primary runtime configuration format is HOCON.

Canonical example:

```text
config/cagnard.example.conf
```

HOCON supports comments, includes, and substitutions. This makes deployment configuration easier to maintain than JSON while keeping the backend model typed.

## Starting The Backend

From the repository root:

```bash
sbt backend/run
```

By default, the backend reads:

```text
config/cagnard.example.conf
```

Override the path with `CAGNARD_CONFIG`:

```bash
CAGNARD_CONFIG=/path/to/cagnard.conf sbt backend/run
```

Or pass the path as the first backend argument when running the application outside sbt.

## Container Configuration

The backend image accepts the same `CAGNARD_CONFIG` environment variable:

```bash
mocker run --rm \
  -e CAGNARD_CONFIG=/etc/cagnard/cagnard.conf \
  -v /path/to/cagnard.conf:/etc/cagnard/cagnard.conf:ro \
  cagnard-backend:local
```

The image includes `config/cagnard.example.conf` for local demos, but production deployments should mount their own HOCON configuration.

## Helm Configuration

The Helm chart can supply backend config in several ways:

- inline non-secret HOCON rendered as a ConfigMap
- an existing ConfigMap
- an existing Secret
- an existing volume source

Use ConfigMaps only for non-secret settings. Provider credentials, OIDC client secrets, and storage account secrets should come from Kubernetes Secrets, mounted secret files, environment variables, or an external secret operator.

## Relative Paths

Storage root paths declared in configuration are resolved relative to the configuration file location when they are not absolute. This keeps example and deployment bundles relocatable.

## Current Sections

- `server`: bind host and port.
- `auth`: configured-user mode and OIDC provider declarations.
- `users`: local configured users for simple deployments.
- `providers`: storage provider plugin declarations.
- `accounts`: provider account declarations.
- `personalStorage`: per-user storage roots.
- `globalStorage`: administrator-defined shared storage roots.
- `uiPlugins`: frontend plugin declarations.

## Known Limitations

- Configuration is loaded at startup; hot reload is not implemented.
- OIDC provider validation is specified but not fully implemented in the current prototype.
- External secret providers are specified as a direction but not implemented yet.
- JSON is no longer the canonical example format. Typesafe Config can parse JSON-like HOCON when explicitly provided, but project documentation and examples use `.conf`.
