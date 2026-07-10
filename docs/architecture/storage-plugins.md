# Storage Providers And Capabilities

Storage is the central Cagnard abstraction. A provider translates one normalized root and relative path into filesystem, object-store, drive, or future service operations.

## Contract

The Go `StorageProvider` contract covers descriptor and capability discovery, paginated listing, metadata, download/preview/upload, folder creation, rename/delete/copy/move, streaming reads/writes, range reads, and file watching.

A resolved root contains an opaque provider target:

- filesystem: absolute base directory;
- S3: bucket and optional prefix;
- future providers: their own typed target behind the same root boundary.

The API never accepts an arbitrary account ID or absolute backend path from the browser. It resolves configured root identity after authorization.

## Capability States

Each capability is `supported`, `degraded`, or `unsupported`, with an optional explanation. Degraded means Cagnard can preserve the user-visible operation through a less-native path. Examples include S3 rename as copy then delete and S3 follow mode through polling.

Capabilities drive toolbar availability, opener matching, and transfer planning. Code must still handle runtime provider failures; capability discovery is not a guarantee that an external service remains available.

## Listing And Pagination

Providers receive page size, opaque cursor, query, sort key, and sort direction. A native provider cursor is wrapped in a signed or validated Cagnard page reference so it cannot be reused for another root or query.

The response reports accuracy for search, sort, and totals. Filesystem listing can provide exact behavior. S3 can use native continuation for name ordering, while search and non-native sorting require a bounded scan and may report degraded accuracy.

## Transfer Interoperability

Same-root native copy or move can be used when semantics match. Cross-provider transfers stream from source to destination when both providers implement streaming capabilities; otherwise the backend permits only bounded buffering under the configured safety limit. Recursive directories are expanded into child items before or during execution so progress and conflicts are attached to real files.

Move is copy plus source deletion across roots. Source deletion happens only after destination success.

## Adding A Provider

1. Add a typed provider implementation and register its `type`.
2. Resolve configured provider, account, and root settings without leaking credentials.
3. Implement normalized errors and all required interface methods.
4. Advertise accurate capability states and degradation notes.
5. Add unit tests, provider-specific integration tests, and cross-provider transfer tests.
6. Add a runnable Compose example and matching pure Helm values for the provider or a relevant combination.
7. Update the user guide, configuration reference, and capability table.

Provider-specific tests that require a service belong in a separate scoped job, such as the MinIO-backed S3 tests, rather than every backend test invocation.
