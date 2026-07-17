# Browsing And File Operations

Cagnard presents filesystem directories and S3 prefixes through one browser. The active root identifies its personal/global tunnel, provider, account, and capability set.

## Browse And Select

- Select a personal or global root from the sidebar.
- Open a directory or supported file with one click.
- Use breadcrumbs to return to an ancestor or copy the readable path.
- Search, sort, and paginate the current directory through provider-backed listing options.
- Use checkboxes to select multiple entries. Select all applies to the current page.

The URL records the tunnel, root, real directory path, and opened file. Native Back and Forward restore accessible Cagnard locations.

## Copy Or Move

1. Select files or directories and add them to the pasteboard.
2. Browse to any writable destination, including another provider.
3. Choose **Paste** or **Move here**.

The pasteboard is shared by current same-origin tabs and clears on a full browser restart. Accepted entries leave it immediately. Move copies each item first and removes its source only after destination success.

## Delete In The Background

Select one or more entries and choose **Delete**. After confirmation, one task recursively removes files and folders using provider-native traversal. You can leave the directory, inspect per-item progress, or cancel the task.

Cancellation cannot restore completed deletions. Independent selections continue when another item fails, and the task reports a partial result when applicable. The browser refreshes only if you are still at the exact location where the delete started.

## Download Files And Folders

A single selected file streams directly to the browser with its MIME type, content length, and byte-range support. Selecting a directory, several files, or a mixed selection streams an incremental ZIP. Cagnard does not buffer the complete file or archive in browser memory.

ZIP paths are sanitized, duplicate names receive deterministic suffixes, empty directories and provider modification times are retained, and already compressed formats are stored without redundant deflate work. Entries without a provider timestamp use the archive creation time. ZIP downloads cannot resume after interruption; start a new task instead.

## Upload Files And Folders

Use **Upload files**, **Upload folder**, or drag files and directories onto the file browser. Cagnard submits a manifest first, then streams file bodies with bounded concurrency. Directory drag-and-drop can retain explicit empty directories where the browser exposes them.

Keep the tab open while an upload runs. The browser owns source file handles, so reloading or closing it cancels active delivery; completed items remain. Large files stream directly to filesystem or S3 providers, and large S3 writes use multipart upload.

## Conflicts

When a destination already contains a name, the original task becomes blocked. Choose **Keep both**, **Replace**, **Skip**, or cancel. One decision applies to the batch, including nested conflicts discovered later. Keep both allocates an available destination name; replace is never implicit.

## Task Queue

The task button appears when work exists. Its icon shows active, successful, or problem state. Open it to see operation, status, location, aggregate bytes/items, delivery progress, time, and cancel/resolve controls. Expand a task to load server-paginated affected items without transferring the complete tree.

Polling starts at 50 ms for immediate feedback, backs off to 300 ms, 1 second, then 2 seconds, and uses a slow idle poll to notice work from another tab. Completed, partial, error, and canceled tasks remain for one hour or until cleared.

## Limits

- Active tasks and their authenticated stream URLs live only in backend process memory.
- S3 search and non-native sorting can require a bounded full-prefix scan.
- Metadata preservation depends on both providers.
- Provider-native operations may be faster, but must preserve the same task and conflict semantics.

See [background task architecture](../architecture/tasks.md), [task API](../reference/task-api.md), and [provider capabilities](../reference/provider-capabilities.md).
