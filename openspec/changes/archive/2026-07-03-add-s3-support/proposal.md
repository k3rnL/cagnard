## Why

Cagnard currently proves the storage abstraction with the Unix filesystem provider, but the product goal requires browsing and moving data across cloud object storage as a first-class provider family. S3-compatible support is the next useful provider because it covers AWS S3 and many S3-compatible systems such as MinIO, Cloudflare R2, and Wasabi through one plugin contract.

## What Changes

- Add an S3-compatible storage provider implementation behind the existing storage provider abstraction.
- Allow HOCON configuration to declare S3-compatible providers, accounts, endpoint/region options, bucket-backed roots, and secret references without adding backend-local state.
- Map S3 objects and common prefixes into Cagnard storage entries with normalized metadata, capabilities, and namespaced provider-specific metadata.
- Implement the basic browser operations that are safe and practical for S3-compatible object storage: list, stat, download, upload, bounded text preview, create folder marker or prefix support, copy, move as copy-then-delete, and delete.
- Report S3-specific limitations through capabilities, including degraded rename/move semantics, missing POSIX permissions, optional versioning, optional server-side encryption, and object lock/retention availability.
- Add tests and documentation for local S3-compatible development, including MinIO-style endpoints and secret externalization.

## Capabilities

### New Capabilities

- `s3-storage-provider`: Concrete S3-compatible storage provider behavior, configuration, credential handling, metadata mapping, object operations, and compatibility constraints.

### Modified Capabilities

None. Existing provider-neutral storage, browser, configuration, and secret-management specs already define the cross-provider contracts this provider must implement.

## Impact

- Backend storage layer: new provider implementation registered from `providers[].type = s3` or equivalent S3-compatible provider type.
- Backend configuration: provider/account/root models and HOCON examples need S3 endpoint, region, bucket/root prefix, read-only, and secret-reference fields.
- Backend dependencies: add an S3-compatible client library and focused test support for local object-store behavior.
- API behavior: existing storage APIs should continue to expose provider-neutral roots, entries, metadata, capabilities, downloads, uploads, and mutations.
- Frontend behavior: the browser should need little or no provider-specific UI; S3-specific information should appear through existing metadata/capability/provider-specific extension surfaces.
- Documentation: update provider configuration, storage plugin, and local development docs with S3-compatible examples and limitations.
