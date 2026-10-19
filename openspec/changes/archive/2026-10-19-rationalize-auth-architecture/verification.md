# Authentication v2 verification

Validated on 2026-10-17. See [tasks](tasks.md), [design](design.md), the [operator model map](../../../../docs/README.md#authentication-model-map), and the [runnable Keycloak example](../../../../examples/run/oidc-keycloak/README.md).

## Automated checks

| Check | Result |
| --- | --- |
| Backend `go test -race ./...` | Passed; changed API/storage-access/authentication packages also rerun after final refinements |
| Frontend TypeScript build | Passed |
| Frontend Vitest | 133 tests across 16 files passed |
| Frontend production Vite build | Passed; existing large-bundle warning remains |
| WASM `scripts/check-demo.mjs` | Passed, including static login, public HTTP content and denied mutations |
| Documentation link/asset validation | Passed |
| Helm lint and all example renderings | Passed |
| Four Compose examples and three source-build overrides | All configurations render |
| Compose public-image manifest lookup | Existing `quay.io/minio/mc:latest` returns HTTP 401, including an anonymous registry-token attempt; full image availability is not verified |
| OpenSpec strict validation | Passed |
| Diff whitespace check | Passed |

The backend regressions cover canonical identity separation, session integrity/encryption/expiry/key rotation, static account changes, group mapping revisions, strict configuration, origin/header protection, default-deny scopes, content/read bypasses, action composition, account ceilings, task ownership and fresh conflict continuation. They also cover symlink confinement, interruption of a blocked range reader, stopping recursive work between effects, overlapping copy rejection, and write-only/upload and delete-only/task grants.

The isolated OIDC server exercises signed code exchange with client authentication and S256, issuer/audience/authorized-party/signature/algorithm/nonce/subject/expiry failures, code replay, superseded and expired transactions, denied consent, oversized or mistyped group claims, unknown values, JWKS rotation and provider outage. Static and OIDC members of the same group are compared against identical source, destination and read-only-root policies.

## Live browser interoperability

Used the checked-in Keycloak 26.8.1 realm and client with a temporary Cagnard configuration whose storage targets contain only disposable files.

- Static login and local logout succeed, including keyboard submission and username focus restoration.
- Real Keycloak authorization redirect and callback succeed with the engineering user; shared storage actions match the static engineering user. The two providers retain different canonical identities.
- Both static and OIDC users without grants stay signed in and see the accessible no-storage state.
- The read-only static user can select/read/copy while folder creation, upload, rename and delete remain unavailable.
- Cagnard logout clears its UI/session; subsequent SSO can reuse the remaining Keycloak session, matching the documented local-only behavior.
- Failed callback handling presents an alert and removes the error marker from the current browser URL. SSO discovery outage presents a safe error while the static form stays usable.
- Inspected 390-pixel mobile and 1280-pixel desktop layouts in Classic/Solar, light/dark and the system default. No horizontal overflow was observed in login, error, or no-storage views. Controls retain visible labels and keyboard focus.

Protocol-negative cases and key rotation use the automated fixture; they are not represented as repeated live Keycloak browser tests. Provider-specific production claim configuration still needs deployment validation. No production IdP or real user data was modified.

## Release verification, 2026-10-19

- Repeated the complete Go race suite, all 133 frontend tests, production frontend build, and WASM demo checks successfully.
- Built backend and frontend release containers and verified the packaged frontend/proxy, static login, listing, file write/read, logout, and authentication enforcement using disposable storage.
- Verified live static and Keycloak sign-in again; the user also accepted the local example.
- Resolved the earlier MinIO image availability limitation by building the server and client from pinned official source commits. Both builds and client bucket initialization passed.
- S3 streaming/multipart, root-download, and Iceberg integration tests passed with the new MinIO build and the race detector.
- All four Compose examples, three application build overrides, Helm lint/renderings, 65 reader documentation pages, all 27 main OpenSpec specifications, and whitespace checks passed. All 11 Mermaid diagrams were rendered and visually reviewed during the documentation audit.
- Aligned frontend/chart versions, Helm images, Compose defaults, and release setup instructions to v0.12.0. The published notes explicitly require coordinated auth v2 migration.
