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
docker run --rm \
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

Filesystem storage root paths declared in configuration are resolved relative to the configuration file location when they are not absolute. Object-store roots such as S3 use provider-specific settings like `bucket` and `prefix`; those values are not rewritten as local filesystem paths.

## Authentication Modes

`auth.mode` controls how protected API requests resolve the current user:

- `static`: users authenticate through `/api/auth/login`; the backend issues a signed stateless browser session.
- `development`: local-only compatibility mode that accepts `X-Cagnard-User`, bearer placeholder tokens, or `auth.defaultUser`.
- `external`: reserved for future OIDC/SSO providers.

The example config uses `static`. In that mode `auth.configuredUsersEnabled` must be `true`, `auth.defaultUser` is ignored, every configured user needs `users[].credential.verifier`, and `auth.session.signingSecret` must be set.

## Static Login

Static users are declared under `users`. Passwords are not configured in plaintext. Each user provides verifier material:

```hocon
users = [
  {
    id = alice
    displayName = "Alice Example"
    roles = [user, admin]
    groups = [engineering]
    credential {
      verifier = "pbkdf2-sha256:..."
    }
  }
]
```

The demo verifier in `config/cagnard.example.conf` accepts `alice` / `cagnard`. It is intentionally only for local use.

## Session Settings

`auth.session` configures stateless browser sessions:

- `signingSecret`: HMAC signing secret for session tokens.
- `ttlSeconds`: token and cookie lifetime.
- `cookieName`: browser cookie name, defaulting to `CAGNARD_SESSION`.
- `secureCookies`: whether to add the `Secure` cookie attribute.

Deployments should externalize `signingSecret` and credential verifiers through HOCON substitutions, mounted secret files, Kubernetes Secrets, or another external secret system.

## S3-Compatible Storage

S3-compatible providers use `providers[].type = s3`. Provider, account, and root settings are supplied through HOCON `settings` maps so the core config model remains plugin-oriented.

Provider settings:

- `region`: required AWS-compatible region value.
- `endpoint`: optional custom endpoint for MinIO, R2, Wasabi, or other S3-compatible providers.
- `pathStyleAccess`: set `true` for providers that require path-style bucket addressing.
- `sslEnabled`: controls the default scheme when `endpoint` omits `http://` or `https://`.
- `trustAllCertificates`: local/insecure escape hatch for development endpoints with untrusted certificates.
- `maxBufferedObjectBytes`: upload/download and non-streaming backend-mediated transfer fallback limit, default `67108864` bytes. Filesystem streaming transfers can exceed this limit; providers without stream support are rejected before download when the source size is known.

Account credential modes:

- `static`: `accessKeyId`, `secretAccessKey`, and optional `sessionToken`.
- `default-chain`: use the runtime AWS/JVM default credential provider chain.
- `profile`: use `profile` from compatible AWS config/credential files.

Root settings:

- `bucket`: required S3 bucket name.
- `prefix`: optional root prefix. Browser paths are scoped under this prefix.
- `label`: optional root display name. If omitted, bucket roots display the bucket name.

See `config/cagnard.s3.example.conf` for a safe snippet using environment substitutions instead of checked-in secrets.

## Current Sections

- `server`: bind host and port.
- `auth`: authentication mode, static login provider settings, session settings, and future OIDC provider declarations.
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
