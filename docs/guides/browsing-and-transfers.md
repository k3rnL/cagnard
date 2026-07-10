# Browsing And Transfers

Cagnard presents filesystem directories, S3 prefixes, and future provider containers through one browser model. The active root always identifies its personal/global tunnel, provider, account, and capability set.

## Browse And Find Files

- Select a personal or global storage root from the sidebar.
- Open a directory or supported file with one click.
- Use breadcrumbs to return to an ancestor or copy the current readable path.
- Search and sort the current directory through backend listing options.
- Move through large listings with provider-backed pagination. “Select all” applies to the current page.

The URL records the active tunnel, root, directory path, and opened file. Native Back and Forward restore prior Cagnard locations when they remain accessible.

## File Actions

Available actions are negotiated from provider and entry capabilities. Depending on the selected root and entries, you can create files or folders, upload, download, rename, delete, copy, or move. Unsupported or degraded provider operations remain disabled or are explained instead of being attempted optimistically.

Destructive actions and name input use app-owned dialogs. Operation feedback appears as non-blocking toasts or transfer-task state rather than shifting the file list.

## Copy Or Move With The Pasteboard

1. Select one or more files or directories.
2. Add them to the pasteboard.
3. Browse to any writable destination, including another provider.
4. Choose **Paste** to copy or **Move here** to copy and then delete the source after destination success.

The pasteboard is synchronized between currently open same-origin tabs, contains only safe entry references, and does not persist across a complete browser restart. Selected entries leave the pasteboard as soon as the backend accepts the task.

## Conflicts

When a destination name already exists, the original task becomes blocked. Choose **Keep both**, **Replace**, or **Skip**. A batch choice can apply to later conflicts, including conflicts discovered inside nested directories. Replace is never implicit.

## Transfer Progress

The transfer button reports pending, blocked, running, completed, canceled, and error states. Expand a task to inspect paginated per-file status and byte progress. Recursive directories are planned as child files and processed with configurable concurrency (`tasks.maxConcurrentTransfers`, default `4`).

Large cross-provider files use streaming paths when both providers support them. Move deletes the source only after destination success; a later source-delete failure is reported as partial success and the destination copy remains.

## Limits

- S3 search and non-native sorting can require a bounded full-prefix scan.
- Metadata preservation depends on both providers.
- Provider-native operations may be faster than backend-mediated transfers but must preserve the same semantics.
- Active task state is in backend memory; the current stateless task engine is not durable across backend restarts.

See [Transfer task architecture](../architecture/transfer-jobs.md) and [provider capabilities](../reference/provider-capabilities.md).
