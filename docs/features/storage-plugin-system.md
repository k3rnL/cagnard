# Storage Plugin System

## Behavior

Storage is modeled as a provider plugin abstraction. Providers expose normalized roots, entries, metadata, and capabilities.

The implemented providers are the Unix filesystem provider and the S3-compatible provider.

The Unix filesystem provider supports:

- list and stat
- exact paginated listing with backend-side current-directory search and sorting
- raw-byte download
- full and bounded content reads
- byte-range reads for seeking and partial opening
- streaming read and streaming write
- upload
- paginated text preview
- content search within a single file (regex and case-sensitivity options)
- change notification through native filesystem events (`watch`)
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
- native continuation-token listing for default name-ascending browsing
- provider-neutral paginated search and non-native sorting through bounded prefix scanning
- raw-byte download and upload with a configurable buffered object limit
- full and bounded content reads within the buffered object limit
- byte-range reads through `GetObject` range requests for seeking and partial opening
- paginated text preview
- content search within a single object (regex and case-sensitivity options)
- change notification through backend-side polling (`watch`, reported as degraded)
- direct overwrite/write-back where root policy allows it
- folder markers for directory-like prefixes
- implicit directory-like prefixes derived from object listing, even when no folder marker object exists
- copy objects and delete objects or directory-like prefixes
- rename and move as degraded copy-then-delete object operations
- provider-neutral recursive paste where prefix listing, folder markers, upload, and delete semantics allow it

Delete is exposed as a user-level storage operation: deleting a directory or prefix removes the whole entry tree when the provider can enumerate it. S3 directory-like prefixes are not real directories, so provider-native copy, rename, and move remain object-oriented, while delete and cross-root pasteboard transfer can recursively traverse prefixes. Cagnard treats listed S3 prefixes as directory entries even when the bucket does not contain explicit folder marker objects.

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
      trustAllCertificates = false
      requestChecksumCalculation = "when_required"
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
- Listing providers return page metadata, optional opaque next-page references, and accuracy flags for search, sort, and total counts.
- Content access capabilities distinguish `full-read`, `bounded-read`, `range-read`, `stream-read`, and `stream-write`; `range-read` is supported for both providers.
- The `content-search` capability indicates in-file text search; `watch` indicates per-file change notification (supported for the filesystem provider, degraded via polling for S3).
- The filesystem provider exposes supported `stream-read` and `stream-write` capabilities.
- S3 exposes supported `stream-read` and `stream-write` capabilities; `multipart-upload` remains planned. Provider-neutral S3 transfer streams object bytes through the backend when both endpoints support streaming.
- Write-back is represented through `overwrite` and is disabled for read-only roots.
- S3 upload/download and provider-neutral buffered fallback transfer buffer object bytes and default to a 64 MiB limit; streaming transfers are not bounded by that buffer limit.
- S3 default listing uses provider continuation tokens and reports unknown total counts until pages are traversed. Search or non-name sorting may require scanning the configured root prefix before returning a page.
- MinIO-compatible integration tests are opt-in through `CAGNARD_S3_INTEGRATION=true` and S3-specific environment variables.

## Known Limitations

- Google, Azure, WebDAV, and SFTP providers are planned but not implemented.
- Provider-native directory copy is not implemented for the Unix provider; recursive pasteboard transfer is mediated by the backend service.
- S3 multipart upload, provider-native recursive prefix copy/rename/move, IAM/policy management, and bucket administration are future work.
- S3 change notification is backend-side polling rather than native push, and is reported as a degraded `watch` capability.
