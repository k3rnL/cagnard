# Go Backend Runtime

## Behavior

Cagnard's production backend runtime is implemented in Go under `backend-go/`. It preserves the stateless HOCON configuration model, static login and session behavior, provider-neutral storage APIs, filesystem and S3-compatible providers, UI plugin discovery, and transfer job APIs used by the frontend.

The default backend container image builds a single Go binary and runs it without sbt, Scala, or a JVM.

## Local Commands

Run backend tests:

```bash
cd backend-go
go test ./...
```

Run the backend with the default example config:

```bash
cd backend-go
go run ./cmd/cagnard-backend
```

Run with an explicit config:

```bash
cd backend-go
CAGNARD_CONFIG=/path/to/cagnard.conf go run ./cmd/cagnard-backend
```

Build a local binary:

```bash
cd backend-go
go build -o ../tmp/cagnard-backend ./cmd/cagnard-backend
```

## Lifecycle

The Go backend:

- reads `CAGNARD_CONFIG` or falls back to the checked-in example config
- binds to the configured host and port
- exposes `/api/health` for readiness and liveness probes
- handles termination signals with HTTP server shutdown
- keeps transfer jobs in memory, matching the stateless backend constraint

## Compatibility Coverage

Go tests cover:

- canonical and runnable example HOCON config loading
- static password verification and stateless sessions
- personal/global root access resolution
- filesystem provider browsing, content, mutation, streaming, and recursive delete
- S3-compatible object and prefix semantics through fake-client tests
- frontend-used API routes for auth, navigation, UI plugin discovery, listing, stat, preview, upload, download, mutation, transfer, and transfer jobs

The previous Scala backend source and sbt build were removed after Go parity validation. Docker, Helm, CI validation, and release publishing use the Go backend by default.

## Known Limitations

- External OIDC/SSO validation remains a future authentication provider implementation.
- S3 generic streaming and multipart uploads are not implemented yet; non-streaming cross-provider fallback is bounded by `maxBufferedObjectBytes`.
- Transfer jobs are in memory and are lost on backend restart.
