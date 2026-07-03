## 1. Configuration And Root Model

- [x] 1.1 Extend provider, account, and storage-root configuration models with optional provider-specific settings maps while preserving existing HOCON compatibility.
- [x] 1.2 Update JSON/HOCON codecs and config validation for S3 provider, account, and root required settings.
- [x] 1.3 Refactor resolved storage roots from filesystem-only paths to provider-neutral root targets.
- [x] 1.4 Keep relative path resolution scoped to filesystem roots and avoid rewriting S3 bucket/prefix settings.
- [x] 1.5 Add display label behavior so bucket names are default root labels and custom labels can hide long bucket/prefix names.

## 2. S3 Client And Provider Registration

- [x] 2.1 Add an S3-compatible JVM client dependency and a small internal S3 client adapter boundary.
- [x] 2.2 Implement static key, optional session token, default provider chain, and named profile credential modes.
- [x] 2.3 Implement endpoint, region, path-style addressing, SSL/TLS enablement, and unsafe SSL verification configuration.
- [x] 2.4 Register the S3 storage provider from `providers[].type = s3` without changing existing filesystem registration.
- [x] 2.5 Ensure S3 diagnostics omit access keys, secret keys, session tokens, and full credential settings.

## 3. S3 Entry Mapping And Metadata

- [x] 3.1 Implement bucket/prefix path normalization so all S3 operations remain scoped to the configured root prefix.
- [x] 3.2 Map S3 common prefixes to directory entries and objects to file entries.
- [x] 3.3 Deduplicate zero-byte folder markers and common-prefix directory entries.
- [x] 3.4 Map S3 size, MIME type, modified time, version, encryption, and retention metadata to normalized metadata when available.
- [x] 3.5 Mark unavailable S3 owner and permission metadata explicitly and expose ETag, storage class, bucket, key, checksum, and object lock details as namespaced provider metadata.

## 4. S3 Operations And Capabilities

- [x] 4.1 Implement list and stat for S3 roots with paginated listing support or explicit paging diagnostics.
- [x] 4.2 Implement download, upload, and text preview with a configurable buffered object limit defaulting to 64 MiB.
- [x] 4.3 Implement create-folder through a zero-byte folder marker or equivalent prefix representation.
- [x] 4.4 Implement object copy, delete, move as copy-then-delete, and rename as same-parent copy-then-delete.
- [x] 4.5 Reject unsupported recursive prefix copy, move, rename, and delete rather than partially mutating prefixes.
- [x] 4.6 Report read-only roots as unsupported for mutation capabilities and report object-store move/rename semantics as degraded.

## 5. Examples And Documentation

- [x] 5.1 Add safe S3 HOCON example snippets using environment substitutions or placeholder secret references.
- [x] 5.2 Update backend configuration documentation for S3 provider/account/root settings and credential modes.
- [x] 5.3 Update storage plugin documentation with S3 behavior, object-store limitations, metadata mapping, and buffered object limits.
- [x] 5.4 Document local S3-compatible development and MinIO-compatible integration test usage without requiring MinIO for generic backend tests.

## 6. Tests And Verification

- [x] 6.1 Add unit tests for S3 configuration decoding, validation, display labels, and provider registration.
- [x] 6.2 Add unit tests for S3 bucket/prefix path normalization and traversal/root escape rejection.
- [x] 6.3 Add unit tests for S3 listing, folder marker deduplication, metadata mapping, capability reporting, and buffered object limit enforcement using a test adapter.
- [x] 6.4 Add S3-provider-only integration test wiring for MinIO or an S3-compatible service.
- [x] 6.5 Run `sbt backend/test`.
- [x] 6.6 Run OpenSpec validation for `add-s3-support`.
