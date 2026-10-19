# Configuration Reference

This reference describes the implemented HOCON model. See [Configuration](../operations/configuration.md) for deployment practice and [`config/cagnard.example.conf`](../../config/cagnard.example.conf) for a complete file.

## Top-Level Sections

| Key | Purpose |
| --- | --- |
| `server` | HTTP bind host and port |
| `tasks` | Background task worker limits |
| `appearance` | Operator palette/mode defaults and user override policy |
| `structuredData` | Browser analytical processing limits and hard safety policy |
| `auth` | Versioned provider registry and shared protected sessions |
| `authorization` | Declared groups, action roles, and scoped bindings |
| `providers` | Provider implementations and shared connection behavior |
| `accounts` | Credentials and read/write policy for one provider |
| `personalStorage` | User-facing personal roots |
| `globalStorage` | Shared roots granted through authorization bindings |

## `server`

| Field | Type | Notes |
| --- | --- | --- |
| `host` | string | Defaults to `127.0.0.1`; use `0.0.0.0` inside a container. Explicit development identities require loopback. |
| `port` | integer | Defaults to `8080` |

## `tasks`

| Field | Type | Default |
| --- | --- | --- |
| `maxConcurrentItems` | positive integer | `4` |
| `maxConcurrentTransfers` | positive integer | compatibility fallback |

`maxConcurrentItems` bounds eligible copy, move, delete, and browser-fed upload items. Incremental ZIP reads remain sequential. When the generic key is absent, Cagnard uses `maxConcurrentTransfers`; new configurations should use only `maxConcurrentItems`.

## `appearance`

| Field | Values | Default |
| --- | --- | --- |
| `defaultPalette` | `classic`, `solar` | `classic` |
| `defaultMode` | `light`, `dark`, `system` | `system` |
| `allowUserOverride` | boolean | `true` |

The section is optional. Invalid enum values fail startup. The public `/api/appearance` response exposes only these safe fields.

## `structuredData`

All fields are positive integers. Defaults apply when the section or field is omitted. Values above the hard maximum fail startup.

| Field | Default | Hard maximum |
| --- | ---: | ---: |
| `relational.maxIngestionBytes` | 67,108,864 | 536,870,912 |
| `relational.maxIngestionRows` | 200,000 | 1,000,000 |
| `sql.timeoutMilliseconds` | 30,000 | 120,000 |
| `sql.maxResultRows` | 100,000 | 500,000 |
| `sql.maxQueryCharacters` | 100,000 | 200,000 |
| `worker.maxResponseBytes` | 16,777,216 | 67,108,864 |
| `iceberg.maxMetadataBytes` | 2,097,152 | 16,777,216 |
| `iceberg.maxProbeEntries` | 10,000 | 100,000 |
| `netcdf.maxSourceBytes` | 134,217,728 | 536,870,912 |
| `netcdf.maxSliceCells` | 100,000 | 1,000,000 |
| `netcdf.maxSliceBytes` | 16,777,216 | 67,108,864 |
| `netcdf.maxProjectionRows` | 100,000 | 1,000,000 |
| `netcdf.maxPlotCells` | 20,000 | 100,000 |
| `exports.maxRows` | 100,000 | 500,000 |
| `exports.maxBytes` | 16,777,216 | 67,108,864 |

`netcdf.maxPlotCells` and `netcdf.maxProjectionRows` cannot exceed `netcdf.maxSliceCells`. `exports.maxBytes` cannot exceed `worker.maxResponseBytes`. The authenticated `/api/structured-data/config` response contains these validated limits and no secrets. See [structured-data limits](../architecture/structured-data-limits.md) for their effect on viewers.

## `auth`

`version = 2`, an explicit browser `publicUrl`, protected `session`, and enabled `providers[]` are required. Static and OIDC providers can coexist. Explicit local development is mutually exclusive with them. See the complete [authentication provider reference](authentication.md) and [identity/session model](identity-and-sessions.md).

## `authorization`

`groups[]` declares audiences, `roles[]` declares explicit storage action sets, and `bindings[]` assigns roles to subjects on named tunnel/root pairs. No binding means no access. There are no built-in admin roles or per-user global roles. See [authorization models and the action matrix](authorization.md).

## `users[]`

The former top-level array was removed. Static users now belong to `auth.providers[].users`; development users belong to `auth.development.users`. See [static user fields](authentication.md#static-provider-and-user-models) and the [migration guide](../guides/migrating-auth.md).

## `providers[]`

Common fields are `id`, `type`, `family`, `displayName`, and a string-valued `settings` object.

### Filesystem Provider

```hocon
{ id = local, type = filesystem, family = unix, displayName = "Local filesystem" }
```

Filesystem roots use their `path`; account credentials are the backend process identity.

### S3 Provider Settings

| Setting | Notes |
| --- | --- |
| `region` | Required |
| `endpoint` | Optional AWS-compatible endpoint; when its scheme is omitted, the scheme is inferred from `sslEnabled` |
| `pathStyleAccess` | Use path-style bucket routing; alias `pathStyle` accepted |
| `sslEnabled` | Defaults to `true` |
| `trustAllCertificates` | Local testing only; alias `insecureTrustAllCertificates` accepted |
| `requestChecksumCalculation` | `when_required` (recommended/default) or `when_supported` |
| `maxBufferedObjectBytes` | Positive bounded fallback limit; default 64 MiB |
| `maxListPages` | Positive safety bound for degraded full-prefix scans; default `1000` |

## `accounts[]`

Common fields are `id`, `providerId`, `displayName`, `enabled`, `readOnly`, `authMode`, and string-valued `settings`.

Filesystem accounts use `authMode = local-process`. Put S3 credentials in `accounts[].settings`; `settings.credentialMode` selects the mode, with `authMode` as a fallback:

- `static`: `accessKeyId`, `secretAccessKey`, optional `sessionToken`;
- `default-chain`: AWS SDK default credential chain;
- `profile`: required `settings.profile`.

Disabled accounts do not produce usable roots. Read-only accounts expose browsing but reject mutation.

## Storage Roots

`personalStorage[]` and `globalStorage[]` share:

| Field | Notes |
| --- | --- |
| `id` | Stable URL/API identity within its tunnel |
| `label` | Optional readable name; S3 falls back to bucket |
| `providerId` | Existing provider ID |
| `accountId` | Existing enabled account for that provider |
| `path` | Filesystem base; only `{principal.storageKey}` is interpolated |
| `settings` | S3 uses required `bucket` and optional `prefix` |

Access is granted only by [authorization bindings](authorization.md#binding-model). Root IDs remain stable within their tunnel. Account enablement/read-only status and provider support limit effective actions. See the complete [storage provider, account, root, key, and resolved access models](storage-access.md).

File openers are maintained frontend code rather than runtime configuration. The removed top-level `uiPlugins` key is rejected with a migration diagnostic; see [Migrating from `uiPlugins`](../guides/migrating-ui-plugins.md).
