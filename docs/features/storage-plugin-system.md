# Storage Plugin System

## Behavior

Storage is modeled as a provider plugin abstraction. Providers expose normalized roots, entries, metadata, and capabilities.

The implemented providers are the Unix filesystem provider and the S3-compatible provider.

The Unix filesystem provider supports:

- list and stat
- raw-byte download
- full and bounded content reads
- upload
- bounded text preview
- direct overwrite/write-back where root policy allows it
- create folder
- rename
- delete file or empty directory
- copy regular file
- move file or directory
- provider-neutral recursive transfer through list, create folder, download, upload, and delete

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
- copy and delete objects
- rename and move as degraded copy-then-delete object operations
- provider-neutral recursive paste where prefix listing, folder markers, upload, and delete semantics allow it

S3 directory-like prefixes are not real directories. Provider-native lifecycle operations remain object-oriented, while cross-root pasteboard transfer can recursively traverse prefixes through the provider-neutral transfer service.

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
- Content access capabilities distinguish `full-read`, `bounded-read`, `range-read`, and `stream-read`.
- Current providers expose `full-read` and `bounded-read`; `range-read` and `stream-read` are planned.
- Write-back is represented through `overwrite` and is disabled for read-only roots.
- S3 upload/download and provider-neutral fallback transfer currently buffer object bytes and default to a 64 MiB limit.
- MinIO-compatible integration tests are opt-in through `CAGNARD_S3_INTEGRATION=true` and S3-specific environment variables.

## Known Limitations

- Google, Azure, WebDAV, and SFTP providers are planned but not implemented.
- Provider-native directory copy is not implemented for the Unix provider; recursive pasteboard transfer is mediated by the backend service.
- S3 multipart upload, range reads, streaming transfer, provider-native recursive prefix mutation, IAM/policy management, and bucket administration are future work.
