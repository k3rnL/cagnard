# Storage Plugin System

## Behavior

Storage is modeled as a provider plugin abstraction. Providers expose normalized roots, entries, metadata, and capabilities.

The implemented providers are the Unix filesystem provider and the S3-compatible provider.

The Unix filesystem provider supports:

- list and stat
- raw-byte download
- upload
- bounded text preview
- create folder
- rename
- delete file or empty directory
- copy regular file
- move file or directory

All filesystem paths are resolved within the configured storage root.

The S3-compatible provider supports:

- AWS S3 and compatible endpoints such as MinIO, R2, and Wasabi
- static access key credentials, default credential chain, and named profiles
- custom endpoint, region, path-style addressing, SSL/TLS, and local unsafe certificate options
- bucket and optional prefix roots
- list and stat
- raw-byte download and upload with a configurable buffered object limit
- bounded text preview
- folder markers for directory-like prefixes
- copy and delete objects
- rename and move as degraded copy-then-delete object operations

S3 directory-like prefixes are not real directories. Recursive prefix copy, move, rename, and delete are intentionally rejected in the first S3 implementation.

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
- S3 upload/download currently buffers object bytes and defaults to a 64 MiB limit.
- MinIO-compatible integration tests are opt-in through `CAGNARD_S3_INTEGRATION=true` and S3-specific environment variables.

## Known Limitations

- Google, Azure, WebDAV, and SFTP providers are planned but not implemented.
- Directory copy is not implemented for the Unix provider.
- S3 multipart upload, streaming transfer, recursive prefix mutation, IAM/policy management, and bucket administration are future work.
