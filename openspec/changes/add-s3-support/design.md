## Context

Cagnard currently has a working provider-neutral browser API backed by one `StorageProvider` implementation: the Unix filesystem provider. The storage registry selects providers by `ProviderConfig.type`, access resolution turns configured roots into `ResolvedStorageRoot`, and the browser calls the same backend routes for list, stat, preview, download, upload, create folder, rename, copy, move, and delete.

The current root model still assumes a local filesystem path: `ConfigLoader` resolves every root `path` relative to the HOCON file, and `ResolvedStorageRoot` stores a `java.nio.file.Path`. S3-compatible support needs to preserve the provider-neutral browser contract while allowing object-store roots that are bucket/prefix locators, not local paths.

## Goals / Non-Goals

**Goals:**

- Add an S3-compatible provider for AWS S3 and compatible endpoints such as MinIO, R2, and Wasabi.
- Keep S3 behind the existing `StorageProvider` contract so the frontend does not need S3-specific primary workflows.
- Support stateless HOCON configuration for endpoints, regions, credentials, SSL/TLS behavior, path-style addressing, buckets, prefixes, access rules, and read-only accounts.
- Normalize S3 objects and common prefixes into Cagnard entries with comparable metadata and provider-specific details.
- Implement practical object operations: list, stat, download, upload, bounded text preview, create folder marker, copy object, move object as copy-then-delete, delete object.
- Report S3 limitations through capabilities and entry metadata instead of hiding provider semantics.
- Provide local/CI validation against an S3-compatible endpoint.

**Non-Goals:**

- Full S3 administration, bucket creation, IAM policy management, ACL editing, lifecycle rule editing, or replication management.
- Complete recursive prefix rename/move/copy in the first implementation.
- Provider-native global search beyond current loaded-directory filtering.
- Multipart upload and streaming transfer optimization beyond what is needed for small-to-medium prototype files.
- New frontend provider-specific screens.

## Decisions

### 1. Keep the Browser API Provider-Neutral

The existing storage HTTP routes and frontend browser state remain the public surface. The S3 provider returns `StorageEntry`, `EntryMetadata`, `CapabilityStatus`, `FileContent`, and `TextPreview` like the filesystem provider.

Rationale: this keeps S3 as a plugin/provider implementation detail and preserves the "storage is abstract" architecture.

Alternative considered: add S3-specific API endpoints for buckets and objects. That would be faster for a one-off integration, but it would weaken the transfer-oriented storage abstraction and make later providers harder to integrate consistently.

### 2. Add Provider Options Instead Of S3-Specific Core Fields

Extend provider, account, and root config models with optional generic settings maps:

- provider settings: endpoint, region, path-style access, SSL/TLS enablement, SSL verification mode for development-compatible endpoints, checksum behavior, compatibility flags.
- account settings: credential mode, access key id, secret access key, optional session token, and optional named profile.
- root settings: bucket, prefix, delimiter behavior, optional storage class defaults, and optional display label override.

Existing filesystem config stays valid. Filesystem roots keep using `path`. S3 roots use `settings.bucket` and optional `settings.prefix`; `path` remains supported for filesystem roots and should not be overloaded with object-store syntax.

Rationale: generic settings preserve the plugin-oriented configuration model without baking every provider's fields into the core case classes.

Alternative considered: add first-class `S3ProviderConfig`, `S3AccountConfig`, and `S3RootConfig` into the top-level config model. That gives stronger compile-time typing but couples the core config schema to one provider family and repeats work for future providers.

### 3. Support Common S3 Credential And Compatibility Modes First

Implement these credential modes in the first S3 provider pass:

- `static`: configured access key id, secret access key, and optional session token.
- `default-chain`: the JVM/AWS default provider chain for environment variables, system properties, and platform credentials.
- `profile`: a named local profile when the runtime environment provides an AWS-compatible credentials/config file.

Defer web identity, explicit role assumption, external credential processes, and delegated identity flows until a later auth/secret-management change.

The first S3 provider pass must expose compatibility settings needed by non-AWS S3 providers:

- custom endpoint URL.
- region, including operator-provided dummy/default regions for providers that require one syntactically.
- force path-style addressing.
- SSL/TLS enabled or disabled for local-compatible endpoints.
- SSL verification override only for local development or explicitly insecure deployments, clearly documented as unsafe.

Rationale: static keys are the most direct and required integration path, while default-chain and profile cover common AWS operational setups without implementing the full identity matrix. Endpoint, SSL, and path-style settings are necessary for MinIO and many S3-compatible providers.

Alternative considered: implement only static keys. That would satisfy the simplest non-AWS setup but would make AWS deployments unnecessarily awkward.

### 4. Use Explicit Bucket/Prefix Roots And Display Labels

S3 root configuration should use explicit `bucket` and optional `prefix` settings, not a URI-style shorthand in the first implementation.

Display behavior:

- If a root points to a whole bucket and no custom label is configured, the UI should show the bucket name.
- If a root points to a prefix, the admin can configure a nicer root label so users do not see long or ugly bucket/prefix names.
- Provider descriptors, account descriptors, and root/navigation descriptors should expose display labels independently from technical ids so the storage provider contract can hide provider-specific naming noise from users.
- Provider-specific metadata should still include the real bucket and prefix so operators can inspect the concrete S3 target when needed.

Rationale: explicit bucket/prefix settings avoid ambiguity, while display labels keep navigation clean for end users.

Alternative considered: support `s3://bucket/prefix` shorthand immediately. It is convenient, but it creates parsing edge cases and is not needed before the explicit model is stable.

### 5. Replace Filesystem-Only Root Resolution With Provider Root Targets

Change `ResolvedStorageRoot` from a filesystem-specific `basePath: Path` to a provider-neutral target:

- `FilesystemRootTarget(basePath: Path)`
- `ObjectStoreRootTarget(bucket: String, prefix: String)`

`AccessService` should construct the target based on the provider type. `ConfigLoader` should resolve relative paths only for filesystem roots, using provider lookup during normalization.

Rationale: this avoids pretending S3 roots are local paths and makes future object stores or drive providers easier to model.

Alternative considered: keep `basePath: Path` and encode S3 bucket/prefix as fake paths. That would be brittle, confusing in diagnostics, and unsafe because existing relative path normalization would rewrite bucket locators into host filesystem paths.

### 6. Use The JVM S3 SDK Behind A Small Internal Adapter

Use an S3-compatible JVM client behind an internal `S3ObjectClient` boundary. `S3StorageProvider` depends on that boundary, not directly on route or service code.

The first implementation can use the synchronous client because the current `StorageProvider` trait is synchronous and `ApiService` already wraps operations in `IO`. The adapter boundary keeps room for a future async/streaming provider without changing browser routes.

Rationale: the synchronous client matches the existing provider contract and keeps the first integration smaller.

Alternative considered: refactor `StorageProvider` to return `IO` or streams before adding S3. That is a better long-term direction for large transfers, but it increases blast radius before S3 value is proven.

### 7. Configure Buffered Object Limits

Until the provider API supports streaming, S3 upload and download should enforce a configurable buffered object limit. Use a conservative default of 64 MiB per object, with provider-level configuration and optional root-level override.

The limit applies to browser upload/download paths that materialize object bytes in memory. It does not change list/stat metadata operations, and preview keeps its smaller preview byte limit.

Rationale: the current backend and frontend paths buffer file content. A configurable limit prevents accidental memory pressure while allowing operators to raise it for trusted local deployments.

Alternative considered: leave object size unlimited until streaming exists. That would be simple but unsafe once object storage makes large files easy to access.

### 8. Map S3 Listing To Directory-Like Entries

S3 list operations use a normalized root prefix plus the current browser path:

- `ListObjectsV2` with delimiter `/` creates directory entries from common prefixes.
- Objects become file entries.
- Zero-byte keys ending in `/` are treated as folder markers and should not duplicate common-prefix directory entries.
- Entry paths are always relative to the configured root prefix.

Rationale: this matches the browser's existing directory mental model while preserving S3-specific details in `providerSpecific`.

Alternative considered: show raw object keys as a flat list. That would expose S3 more literally but would make Cagnard less useful as a common storage browser.

### 9. Normalize Metadata Conservatively

Map common S3 object fields into normalized metadata:

- size from content length.
- MIME type from object content type, with safe fallback.
- modified time from last modified timestamp.
- version from version id when available.
- encryption from server-side encryption headers when available.
- retention from object lock retention headers when available.
- owner and permissions are unavailable unless the provider can fetch them safely and consistently.

S3-specific fields such as ETag, storage class, bucket, key, version id, object lock mode, endpoint family, and checksum values remain namespaced in `providerSpecific`.

Rationale: normalized metadata must be comparable across providers and should not imply POSIX semantics where none exist.

Alternative considered: expose all S3 response fields as normalized metadata. That would make S3 richer but would pollute the common comparison surface.

### 10. Mark Object-Store Mutations Honestly

S3 has no true rename or directory move. The provider should:

- upload objects with `PutObject`.
- delete objects with `DeleteObject`.
- copy objects with `CopyObject`.
- move objects as `CopyObject` followed by `DeleteObject`, reported as degraded.
- rename a file object as same-parent copy-then-delete.
- create folders by writing a zero-byte marker ending in `/`.
- mark directory/prefix recursive copy, move, and rename as unsupported for the first implementation.

Rationale: capability reporting should prevent users from believing object-store operations have filesystem atomicity.

Alternative considered: implement recursive prefix copy/delete immediately. That is useful but introduces pagination, partial failure, retry, conflict, and rollback complexity that belongs in a later transfer/job capability.

### 11. Keep Secrets In Runtime Configuration Only

Credential values should come from HOCON substitutions or mounted secret-backed config, not hardcoded examples. Diagnostics and documentation must avoid logging access keys, secret keys, session tokens, or full provider settings.

For local MinIO-compatible demos, use environment variables in example snippets. The checked-in example can include disabled/commented S3 config but no working secret values.

Rationale: this preserves the stateless backend model while avoiding a local secret store.

Alternative considered: introduce encrypted local secret storage now. That conflicts with the current stateless requirement and is not needed for the first S3 provider.

### 12. Keep MinIO Integration Tests Scoped To The S3 Provider

Unit tests should cover mapping, validation, path/key normalization, and capability behavior without requiring a live object store. MinIO or another S3-compatible service should run only for S3 provider integration tests, not every generic backend test.

In CI, this can be a dedicated S3 provider test job or a clearly separated test task with Docker service dependencies. The normal backend test job should stay fast and independent unless it explicitly opts into S3 plugin integration tests.

Rationale: S3 compatibility needs real integration coverage, but generic backend validation should not become dependent on object-store startup and network timing.

Alternative considered: run MinIO in every backend test job. That gives broad coverage but slows unrelated work and increases flakiness outside S3 changes.

## Risks / Trade-offs

- [Risk] Large downloads/uploads are buffered as byte arrays by the current provider API. -> Mitigation: enforce configurable object size limits, document prototype defaults, keep tests moderate, and leave streaming transfer as follow-up work.
- [Risk] S3-compatible providers differ in path-style addressing, checksums, object lock, versioning, and header support. -> Mitigation: make endpoint, region, path-style, and compatibility behavior configurable, and treat unavailable metadata explicitly.
- [Risk] Copy-then-delete move can leave partial state if delete fails. -> Mitigation: report move as degraded and return safe diagnostics; defer robust transfer jobs to a later change.
- [Risk] Folder markers and common prefixes can produce duplicate or confusing directory entries. -> Mitigation: deduplicate by relative path and prefer common-prefix directory entries in listings.
- [Risk] Adding generic settings maps weakens config typing. -> Mitigation: validate provider-specific required settings at startup and fail with explicit provider/account/root diagnostics.
- [Risk] Tests that require a live S3-compatible service can be slow or flaky. -> Mitigation: keep most behavior in adapter/unit tests and reserve MinIO-compatible integration tests for S3 provider test coverage only.

## Migration Plan

1. Extend config models with optional settings maps while preserving existing filesystem config.
2. Introduce provider-neutral root targets and update filesystem resolution to use `FilesystemRootTarget`.
3. Register the S3 provider only when configured with `type = s3`; existing deployments remain filesystem-only unless they opt in.
4. Add commented or separate example S3 HOCON snippets rather than changing the default demo root.
5. Rollback is removing S3 provider declarations from config; existing filesystem behavior should continue unchanged.

## Open Questions

- None for the first S3 planning pass.
