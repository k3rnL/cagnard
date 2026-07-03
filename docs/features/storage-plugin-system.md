# Storage Plugin System

## Behavior

Storage is modeled as a provider plugin abstraction. Providers expose normalized roots, entries, metadata, and capabilities.

The implemented provider is the Unix filesystem provider. It supports:

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

## Configuration

Provider declarations live under `providers`. Accounts live under `accounts`. Roots reference both provider and account ids.

Example provider:

```hocon
providers = [
  { id = local, type = filesystem, family = unix, displayName = "Local filesystem" }
]
```

## Operational Notes

- Relative root paths are resolved against the config file location.
- Filesystem operations run with the backend process permissions.
- Provider capabilities determine which browser actions are available.

## Known Limitations

- S3, Google, Azure, WebDAV, and SFTP providers are planned but not implemented.
- Directory copy is not implemented for the Unix provider.
- Pagination, rate limits, and provider-specific metadata are future provider responsibilities.
