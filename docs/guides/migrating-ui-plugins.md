# Migrating From `uiPlugins`

The former `uiPlugins` configuration and `GET /api/plugins/ui` endpoint were removed. Those manifests could choose an existing frontend view but could not provide executable parser or rendering code, so they were not a functional plugin system.

## Required Configuration Change

Delete the complete top-level `uiPlugins` section from HOCON and Helm-embedded HOCON. Cagnard deliberately rejects a configuration that still contains the key:

```text
uiPlugins was removed; delete this section because file openers are now built into the frontend
```

No replacement configuration is required. JSON Lines, CSV/TSV, Parquet, Avro, and Arrow routing is built into the frontend and uses MIME plus extension fallback automatically.

## API Change

Clients must stop requesting `/api/plugins/ui`. File opener discovery is not a backend concern anymore. Storage-provider capabilities remain part of navigation and entry responses, and the frontend still checks those capabilities before enabling an opener.

## Custom Behavior

There is currently no supported third-party frontend extension contract. Add maintained behavior as a first-party opener with tests and documentation. Executable third-party UI plugins may return later only with an isolation, versioning, and distribution design.
