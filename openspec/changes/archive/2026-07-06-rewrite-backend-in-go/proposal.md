## Why

Cagnard's backend is currently written in Scala. The prototype has grown into a useful storage browser with stateless HOCON configuration, static login, Unix filesystem and S3-compatible providers, provider-neutral transfer jobs, Docker/Helm packaging, examples, and a frontend API contract that is already exercised by users.

The next backend implementation should be easier to operate, package, and extend for Cagnard's storage-provider direction. Go is a good fit for this because it produces a small single binary, has strong standard-library support for HTTP and streaming IO, has mature S3 and configuration libraries, and is pragmatic for filesystem/network services.

This rewrite is valuable only if it preserves Cagnard's current behavior. The Scala backend must be treated as the executable specification until a delta spec intentionally changes an API or runtime contract.

## What Changes

- Introduce a Go backend that replaces the Scala backend as the production server.
- Preserve the current HTTP API consumed by the React frontend:
  - session and authentication provider discovery
  - static login and logout
  - navigation and storage entry listing
  - stat, preview, raw content download/upload
  - create file/folder, rename, delete, copy, move
  - transfer job create/list/detail/cancel
  - UI plugin manifest discovery
- Preserve stateless backend startup from HOCON configuration:
  - `CAGNARD_CONFIG`
  - first CLI argument config path
  - relative path resolution from the config file directory
  - static user/session settings
  - provider/account/root declarations
  - UI plugin declarations
- Preserve storage provider semantics:
  - Unix filesystem provider behavior, including streaming read/write and recursive delete
  - S3-compatible provider behavior, including custom endpoint/path-style/TLS settings, static/default-chain/profile credentials, bucket/prefix roots, implicit prefixes, bounded buffered object operations, and provider-neutral recursive transfer
  - provider capability reporting
- Preserve transfer behavior:
  - in-memory transfer jobs
  - recursive directory planning
  - streaming filesystem-to-filesystem transfer
  - bounded fallback when streaming is unavailable
  - safe move semantics
  - conflict policies: fail/ask, skip, keep both, replace
  - nested conflict preflight
  - cancellation and partial result reporting
- Preserve security behavior:
  - signed stateless session cookie
  - static password verifier validation
  - unauthorized handling and public login failure messages
  - no required application database
- Replace Scala build/runtime artifacts with Go equivalents in local development, CI, Docker images, Helm values, and examples.
- Keep the frontend unchanged except where endpoint compatibility tests reveal an intentional contract correction.
- Update documentation so operators know the backend is Go-based and can still run existing examples.

## Non-Goals

- No new user-facing storage feature is required by this rewrite.
- No database, durable job store, or cluster coordinator is introduced.
- No OIDC/SSO implementation is added here beyond preserving existing extension points.
- No WebDAV/sync protocol is added here.
- No provider plugin runtime ABI is finalized here; the Go code should keep provider boundaries clean, but external plugin loading remains future work.
- No frontend redesign is included.

## Capabilities

### New Capabilities

- `go-backend-runtime`: Defines the Go service architecture, startup, HTTP routing, config loading, logging, graceful shutdown, build outputs, and release packaging.
- `backend-api-compatibility`: Defines the compatibility requirements between the Scala backend reference behavior and the Go backend replacement.

### Modified Capabilities

- `stateless-backend-configuration`: Preserve HOCON loading and runtime behavior in Go.
- `storage-plugin-system`: Reimplement provider contracts and capabilities in Go while preserving filesystem and S3 semantics.
- `s3-storage-provider`: Reimplement S3-compatible provider support in Go.
- `cross-provider-transfer`: Reimplement transfer jobs and provider-neutral copy/move behavior in Go.
- `user-login-flow`: Reimplement static login and signed stateless sessions in Go.
- `storage-browser`: Preserve API behavior used by the frontend.
- `ui-plugin-system`: Preserve UI plugin manifest discovery.
- `deployment-packaging`: Replace Scala/JVM backend packaging with Go binary/container packaging.
- `ci-release-automation`: Update validation and release jobs for Go backend builds/tests.
- `runnable-example-catalog`: Keep examples runnable with the Go backend.
- `feature-documentation`: Update backend language, local dev commands, and operator docs.

## Impact

- Backend source moves from Scala/JVM implementation to Go implementation.
- Build tooling changes from `sbt backend/test` and JVM packaging to Go test/build commands.
- Docker backend image becomes a Go binary image instead of a JVM image.
- CI must run Go unit/integration tests and still validate frontend, examples, Helm, and release packaging.
- Existing examples and Helm values should continue to work without changing user-facing configuration.
- Existing Scala tests should be translated into Go tests or preserved as API-level compatibility tests until equivalent Go coverage exists.
- Release notes should call this out as a backend runtime rewrite with intended API compatibility.

## Migration Strategy

1. Keep Scala backend as the behavioral reference during implementation.
2. Build the Go backend behind the same API paths and configuration model.
3. Port backend tests capability by capability, starting with config/auth/storage providers, then transfers.
4. Run both backends against selected compatibility fixtures while the Go implementation is incomplete.
5. Switch Docker/Helm/CI to the Go backend only after compatibility coverage passes.
6. Remove Scala backend artifacts only after the Go backend is the default and documented runtime.

## Risks

- HOCON behavior may diverge if the Go parser does not match the Scala/typesafe config behavior closely enough.
- S3-compatible providers vary in edge cases; MinIO integration tests remain important.
- Transfer job behavior is subtle: conflict handling, cancellation, cleanup, and safe move semantics need direct tests.
- Session cookie signing and password verifier compatibility must be handled carefully to avoid breaking existing configured users.
- A rewrite can stall if it is treated as a cleanup opportunity. Scope should remain compatibility-first.
