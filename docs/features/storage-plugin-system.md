# Storage Plugin System

## Behavior

Storage is modeled as a provider plugin abstraction. Providers expose normalized roots, entries, metadata, and capabilities.

The implemented providers are the Unix filesystem provider and the S3-compatible provider.

The Unix filesystem provider supports:

- list and stat
- raw-byte download
- full and bounded content reads
- streaming read and streaming write
- upload
- bounded text preview
- direct overwrite/write-back where root policy allows it
- create folder
- rename
- delete file or directory tree
- copy regular file
- move file or directory
- provider-neutral recursive transfer through list, create folder, stream or bounded read/write, upload, and delete

All filesystem paths are resolved within the configured storage root.

The S3-compatible provider supports:

- AWS S3 and compatible endpoints such as MinIO, R2, and Wasabi
- static access key credentials, default credential chain, and named profiles
- custom endpoint, region, path-style addressing, SSL/TLS, and local unsafe certificate options
- bucket and optional prefix roots
- list and stat
- raw-byte download and upload with a configurable buffered object limit
- full and bounded content reads within the buffered object limit
- bounded text preview
- direct overwrite/write-back where root policy allows it
- folder markers for directory-like prefixes
- copy objects and delete objects or directory-like prefixes
- rename and move as degraded copy-then-delete object operations
- provider-neutral recursive paste where prefix listing, folder markers, upload, and delete semantics allow it

Delete is exposed as a user-level storage operation: deleting a directory or prefix removes the whole entry tree when the provider can enumerate it. S3 directory-like prefixes are not real directories, so provider-native copy, rename, and move remain object-oriented, while delete and cross-root pasteboard transfer can recursively traverse prefixes.

## Configuration

Provider declarations live under `providers`. Accounts live under `accounts`. Roots reference both provider and account ids.

Example provider:

```hocon
providers = [
  { id = local, type = filesystem, family = unix, displayName = "Local filesystem" }
]
```

S3-compatible provider snippet:

```hocon
providers = [
  {
    id = s3-main
    type = s3
    family = s3
    displayName = "S3 compatible"
    settings {
      region = ${?CAGNARD_S3_REGION}
      endpoint = ${?CAGNARD_S3_ENDPOINT}
      pathStyleAccess = true
      sslEnabled = true
      maxBufferedObjectBytes = 67108864
    }
  }
]
```

## Operational Notes

- Relative root paths are resolved against the config file location.
- S3 roots use `settings.bucket` and optional `settings.prefix`; these are not filesystem paths.
- If an S3 root label is omitted, the bucket name is used as the display label.
- Filesystem operations run with the backend process permissions.
- Provider capabilities determine which browser actions are available.
- The `recursive-list` and `transfer` capabilities indicate that a provider can participate in pasteboard transfer planning.
- Content access capabilities distinguish `full-read`, `bounded-read`, `range-read`, `stream-read`, and `stream-write`.
- The filesystem provider exposes supported `stream-read` and `stream-write` capabilities.
- S3 exposes `stream-read`, `stream-write`, and `multipart-upload` as planned; provider-neutral S3 transfer uses bounded fallback unless a provider-native same-root object copy path applies.
- Write-back is represented through `overwrite` and is disabled for read-only roots.
- S3 upload/download and provider-neutral buffered fallback transfer currently buffer object bytes and default to a 64 MiB limit.
- MinIO-compatible integration tests are opt-in through `CAGNARD_S3_INTEGRATION=true` and S3-specific environment variables.

## Known Limitations

- Google, Azure, WebDAV, and SFTP providers are planned but not implemented.
- Provider-native directory copy is not implemented for the Unix provider; recursive pasteboard transfer is mediated by the backend service.
- S3 multipart upload, S3 generic streaming transfer, range reads, provider-native recursive prefix copy/rename/move, IAM/policy management, and bucket administration are future work.
