# Configuration Reference

This reference describes the implemented HOCON model. See [Configuration](../operations/configuration.md) for deployment practice and [`config/cagnard.example.conf`](../../config/cagnard.example.conf) for a complete file.

## Top-Level Sections

| Key | Purpose |
| --- | --- |
| `server` | HTTP bind host and port |
| `tasks` | Background task worker limits |
| `appearance` | Operator palette/mode defaults and user override policy |
| `structuredData` | Browser analytical processing limits and hard safety policy |
| `auth` | Authentication mode, session, static provider, future OIDC declarations |
| `users` | Configured identities and static verifier material |
| `providers` | Provider implementations and shared connection behavior |
| `accounts` | Credentials and read/write policy for one provider |
| `personalStorage` | User-facing personal roots |
| `globalStorage` | Shared roots filtered by authorization selectors |

## `server`

| Field | Type | Notes |
| --- | --- | --- |
| `host` | string | Bind address, for example `0.0.0.0` |
| `port` | integer | HTTP port, normally `8080` |

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

`netcdf.maxPlotCells` and `netcdf.maxProjectionRows` cannot exceed `netcdf.maxSliceCells`. `exports.maxBytes` cannot exceed `worker.maxResponseBytes`. The public `/api/structured-data/config` response contains these validated limits and no secrets.

## `auth`

| Field | Notes |
| --- | --- |
| `mode` | `static`, explicit local `development`, or reserved `external` |
| `configuredUsersEnabled` | Must be `true` for static mode |
| `defaultUser` | Development-mode fallback identity; avoid in production |
| `session.signingSecret` | Required in static mode; inject a high-entropy secret |
| `session.ttlSeconds` | Signed cookie lifetime; defaults to eight hours |
| `session.cookieName` | Defaults to `CAGNARD_SESSION` |
| `session.secureCookies` | Adds `Secure`; enable behind HTTPS |
| `staticProvider.id` | Stable login-provider identifier |
| `staticProvider.label` | User-facing provider label |
| `staticProvider.enabled` | Enables static login discovery |
| `oidcProviders[]` | Reserved declarations: `id`, `issuer`, `audience`, `groupsClaim` |

## `users[]`

Each user requires a unique `id` and may declare `displayName`, `roles`, `groups`, string `claims`, and `credential.verifier`. Static mode requires verifier material for every configured user.

The maintained verifier format is visible in the example config. Never put a plaintext password in `verifier`.

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
| `endpoint` | Optional AWS-compatible endpoint; scheme inferred from `sslEnabled` when omitted |
| `pathStyleAccess` | Use path-style bucket routing; alias `pathStyle` accepted |
| `sslEnabled` | Defaults to `true` |
| `trustAllCertificates` | Local testing only; alias `insecureTrustAllCertificates` accepted |
| `requestChecksumCalculation` | `when_required` (recommended/default) or `when_supported` |
| `maxBufferedObjectBytes` | Positive bounded fallback limit; default 64 MiB |
| `maxListPages` | Positive safety bound for degraded full-prefix scans; default `1000` |

## `accounts[]`

Common fields are `id`, `providerId`, `displayName`, `enabled`, `readOnly`, `authMode`, and string-valued `settings`.

Filesystem accounts use `authMode = local-process`. S3 account `credentialMode` supports:

- `static`: `accessKeyId`, `secretAccessKey`, optional `sessionToken`;
- `default-chain`: AWS SDK default credential chain;
- `profile`: required `profile` (alias `profileName`).

Disabled accounts do not produce usable roots. Read-only accounts expose browsing but reject mutation.

## Storage Roots

`personalStorage[]` and `globalStorage[]` share:

| Field | Notes |
| --- | --- |
| `id` | Stable URL/API identity within its tunnel |
| `label` | Optional readable name; S3 falls back to bucket |
| `providerId` | Existing provider ID |
| `accountId` | Existing enabled account for that provider |
| `path` | Filesystem base; `{user.id}` is expanded for personal roots |
| `settings` | S3 uses required `bucket` and optional `prefix` |
| `allowedUsers` | Exact configured user IDs |
| `allowedRoles` | Any matching role grants visibility |
| `allowedGroups` | Any matching group grants visibility |

When no authorization selector is declared, the root is visible to every authenticated user. Otherwise the selectors use OR semantics: an allowed user ID, any allowed role, or any allowed group grants visibility. Keep root IDs stable because browser URLs and pasteboard references use them.

File openers are maintained frontend code rather than runtime configuration. The removed top-level `uiPlugins` key is rejected with a migration diagnostic; see [Migrating from `uiPlugins`](../guides/migrating-ui-plugins.md).
