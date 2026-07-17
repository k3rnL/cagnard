# Configuration

Cagnard is configured by one HOCON document. The backend does not require a database: users, authentication policy, provider accounts, roots, access rules, appearance defaults, and task concurrency are reconstructed from configuration at startup.

Start from [`config/cagnard.example.conf`](../../config/cagnard.example.conf) for filesystem storage or [`config/cagnard.s3.example.conf`](../../config/cagnard.s3.example.conf) for S3 settings. The complete field list is in the [configuration reference](../reference/configuration.md).

## Select The File

The backend reads `config/cagnard.example.conf` relative to the process working directory unless `CAGNARD_CONFIG` is set:

```bash
CAGNARD_CONFIG=/etc/cagnard/cagnard.conf cagnard-backend
```

The container image uses `/etc/cagnard/cagnard.conf`. The Helm chart can create that file from inline values or mount it from an existing ConfigMap, Secret, or volume.

## Compose A Configuration

HOCON supports comments, includes, and environment substitutions. Keep structural policy in a reviewed file and inject secret values at runtime:

```hocon
auth.session.signingSecret = ${CAGNARD_SESSION_SECRET}

accounts = [
  {
    id = object-store
    providerId = s3-main
    displayName = "Object storage"
    enabled = true
    readOnly = false
    authMode = static
    settings {
      credentialMode = static
      accessKeyId = ${CAGNARD_S3_ACCESS_KEY}
      secretAccessKey = ${CAGNARD_S3_SECRET_KEY}
    }
  }
]
```

`${NAME}` is required. `${?NAME}` is optional and disappears when the environment variable is absent. Prefer the required form for secrets that must exist; an omitted optional value can otherwise fail later validation or provider initialization.

## Validate Before Deployment

Cagnard validates references and supported enum values during startup. A malformed or inconsistent configuration exits with contextual diagnostics instead of silently omitting roots. Validate with the same binary or image you plan to deploy:

```bash
CAGNARD_CONFIG="$PWD/config/cagnard.example.conf" \
  go run ./backend-go/cmd/cagnard-backend
```

A successful process serves `GET /api/health`. Stop it after confirming startup, or use the repository validation scripts during development.

## Change Management

Configuration is read at process start; hot reload is not supported. Roll the backend after changing provider, account, root, authorization, or appearance configuration. File openers are compiled into the frontend and have no runtime configuration section. Because browser sessions are stateless signed cookies, rotating the signing secret invalidates existing sessions.

Treat these changes as a deployment:

1. Validate HOCON and provider connectivity in a non-production environment.
2. Confirm every account points to an existing provider and every root points to an enabled account.
3. Review personal/global access selectors and read-only flags.
4. Roll the backend, then verify `/api/health`, login, navigation, and one read operation.
5. Test a write and transfer only on designated non-production content.

## Task Concurrency

Use the generic setting for new deployments:

```hocon
tasks {
  maxConcurrentItems = 4
}
```

The value must be positive. Increase it only after measuring provider throttling, network bandwidth, and backend memory during multipart uploads and recursive operations. The legacy `maxConcurrentTransfers` key is read only as a fallback when `maxConcurrentItems` is absent.

## Secret Placement

Do not commit session secrets, password verifier source passwords, S3 keys, or private endpoints. Compose can read an untracked `.env`; Kubernetes deployments should use a Secret or external secret integration. See [Security](security.md).
