# Storage Browser

## Behavior

The storage browser provides a provider-neutral view of roots, directories, files, and objects. It supports:

- personal and global navigation areas
- breadcrumbs with hover/focus copy-path action
- readable URL location for the current root and path
- single and multi-selection
- current-directory filtering
- sorting by name, kind, file type, size, modified time, and MIME type
- metadata inspection
- unified open action for folders and files
- explicit in-app file opening through compatible opener plugins
- inline quick opening from the file row
- create file, upload, download, create folder, rename, delete, add to pasteboard, paste, and move from pasteboard
- recent and active transfer job status for pasteboard copy/move operations

Downloads return raw file bytes through the backend content endpoint.

Selecting a file does not fetch file content. The user opens a file explicitly, and Cagnard routes that request through the opener registry after checking file type, size, storage capabilities, and write-back permissions.

The main Open action is shared by folders and files. Opening a folder navigates into it. Opening a file replaces the list view with the opener surface while keeping breadcrumbs and the main storage actions available. File rows swap the file icon for a hover quick-view button that inserts the same opener surface inline between the current row and the next row.

Clicking a file or directory row opens it in one action. Checkbox clicks, keyboard selection, modifier-key row clicks, and inline quick-view controls remain selection-specific so multi-selection stays separate from opening.

The root breadcrumb uses the selected storage root display label. The breadcrumb copy button appears when the path area is hovered or focused and copies the readable path, such as `Home/projects/report.json`, to the browser clipboard.

The browser URL stores stable restore parameters (`tunnel`, `rootId`, and `path`) and a readable hash path, for example `#/personal/Home/projects`. Reloading or opening that URL in another tab restores the location when the authenticated user can access it.

The command bar keeps primary actions directly clickable and places related secondary actions in dropdown groups.

Copy and move use the browser pasteboard. The Copy button adds safe references to the selected entries. The user then navigates to the desired destination root/path and uses the pasteboard dropdown to copy selected staged entries there with Paste or move them there with Move here.

Paste and Move here start backend transfer jobs. When jobs exist, the command bar shows a transfer queue button next to the pasteboard. The button displays a spinner while work is active, a failure marker when any recent job needs attention, or a success marker when recent work completed. Its dropdown shows recent jobs with task progress, latest update time, status, destination context, and cancel action while a job is queued, running, or canceling.

Create, rename, delete, and transfer conflict choices use app-owned modals with inline validation and keyboard handling instead of native browser dialogs.
Delete is provider-neutral from the user's perspective: deleting a folder, prefix, or object asks the active storage provider to remove that entry, including children when the entry is directory-like.

## Configuration

Browser roots come from `personalStorage` and `globalStorage` entries in backend configuration. Available actions are driven by root/account mutability and provider capabilities.

## Operational Notes

- Current search/filtering is scoped to loaded entries in the active directory.
- The file table is horizontally scrollable so provider metadata columns remain reachable on narrow panels.
- Directory navigation keeps the current listing mounted, greys it out, and shows a spinner overlay instead of inserting a transient loading row.
- The metadata panel is a side panel on wide screens and a toggleable drawer on medium and small screens.
- File type labels and icons are derived from provider MIME metadata or extension fallback classification.
- Rename is single-selection.
- Batch delete, download, pasteboard staging, and paste operate on selected entries where supported.
- Pasteboard contents are browser-session local and synchronize across active same-origin tabs when supported by the browser runtime.
- Paste availability is disabled with an inline reason for read-only destinations and invalid self-directory paste targets.
- Transfer job state is backend memory and is polled while jobs are active.

## Known Limitations

- Provider-native search is specified but not implemented.
- Transfer retry and resumability are not implemented yet.
- Range/stream opening is represented in capabilities but not implemented by opener routes yet.
