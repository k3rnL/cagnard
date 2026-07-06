## Overview

The Go rewrite is delivered as a compatibility-first migration. The Scala backend was used as the behavioral reference until the Go backend passed equivalent tests and packaging was switched intentionally.

The first implementation step introduces a parallel Go backend under `backend-go/`. This avoids destabilizing the current release path while allowing config, auth, provider, API, and transfer behavior to be ported incrementally.

## Architecture

### Package layout

```text
backend-go/
  cmd/cagnard-backend/      # binary entrypoint
  internal/api/             # HTTP routes and JSON models
  internal/auth/            # static login, session signing, identity resolution
  internal/config/          # HOCON loading, typed config, validation
  internal/storage/         # provider-neutral model, registry, filesystem, and S3 providers
```

### Compatibility strategy

- Keep the Scala backend in place during the rewrite until Go parity is validated.
- Add Go tests that port Scala backend behavior by capability.
- Keep HTTP JSON models intentionally close to the frontend TypeScript and Scala API models.
- Keep HOCON config keys stable.
- Switch Docker, Helm, and CI to Go only after the Go backend covers current production behavior.

### Initial implementation slice

The first apply pass creates:

- Go module and backend binary entrypoint.
- Typed config model.
- HOCON config loader and validation for existing example configs.
- Basic server startup and health route.
- API skeleton for session/auth-provider discovery/navigation where enough config model exists.
- Initial Go tests proving current example configs load.

This is intentionally not the final backend switch. It creates a compiled, tested Go foundation for later provider and transfer ports.

## Important Decisions

- The Go backend uses a dedicated module instead of replacing Scala files in place.
- HOCON remains the operator-facing format.
- Current Scala routes remain the source of truth for compatibility until Go API compatibility coverage exists.
- In-memory transfer jobs stay acceptable for the first Go implementation, matching current stateless backend constraints.
- Provider interfaces are Go interfaces now, but external plugin loading remains out of scope.

## Risks And Mitigations

- HOCON parser divergence: add tests against every current config and example file.
- API drift: add contract tests before switching the frontend to the Go backend.
- Scope creep: implement feature parity in narrow capability slices.
- S3 edge cases: keep MinIO opt-in integration tests.
- Transfer subtlety: port transfer tests before enabling Go backend in packaged deployments.

## Final Runtime Switch

The default runtime switch removes the Scala implementation and moves the active runtime to Go:

- `Containerfile.backend` builds `backend-go/cmd/cagnard-backend` into a static runtime image.
- GitHub Actions validation runs `go test ./...` from `backend-go` as the primary backend check.
- The Helm chart and runnable examples continue to reference the same `cagnard-backend` image name; that image is now the Go runtime.
- Root documentation and feature docs describe Go commands by default.
