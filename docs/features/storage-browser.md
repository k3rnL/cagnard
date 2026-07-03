# Storage Browser

## Behavior

The storage browser provides a provider-neutral view of roots, directories, files, and objects. It supports:

- personal and global navigation areas
- breadcrumbs
- single and multi-selection
- current-directory filtering
- sorting by name, type, size, modified time, and MIME type
- metadata inspection
- text preview
- upload, download, create folder, rename, delete, copy, and move

Downloads return raw file bytes through the backend content endpoint.

## Configuration

Browser roots come from `personalStorage` and `globalStorage` entries in backend configuration. Available actions are driven by root/account mutability and provider capabilities.

## Operational Notes

- Current search/filtering is scoped to loaded entries in the active directory.
- Rename is single-selection.
- Batch delete, move, and download operate on selected entries where supported.
- Copy currently supports regular files for the Unix filesystem provider.

## Known Limitations

- Provider-native search is specified but not implemented.
- Cross-provider transfer UI is not implemented.
- Conflict handling uses simple prompts and operation banners in the prototype.
