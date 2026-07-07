# Storage Browser

## Behavior

The storage browser provides a provider-neutral view of roots, directories, files, and objects. It supports:

- personal and global navigation areas
- breadcrumbs with hover/focus copy-path action and opened-file terminal segment
- readable URL location for the current root, path, and page-level opened file
- native browser Back and Forward navigation for storage locations
- single and multi-selection
- backend-driven current-directory filtering
- backend-driven sorting by name, kind, file type, size, modified time, and MIME type
- paginated directory browsing with configurable page size
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

The root breadcrumb uses the selected storage root display label. When a file is opened in the page-level opener, the opened file name appears as the final current breadcrumb segment after the containing directory. Ancestor breadcrumb segments remain navigable; the opened-file segment is display-only and is not treated as a directory target.

The breadcrumb copy button appears when the path area is hovered or focused and copies the readable path, such as `Home/projects/report.json`, to the browser clipboard. When a page-level file is open, the copied path includes the opened file name.

The browser URL stores stable restore parameters (`tunnel`, `rootId`, and `path`) and a readable hash path, for example `#/personal/Home/projects`. Page-level opened files add explicit opened-file state so reload, copied URLs, and native browser Back/Forward can restore the opener when the authenticated user can still access the file.

Native browser Back and Forward restore Cagnard root changes, directory navigation, breadcrumb navigation, page-level file opening, and closing a page-level opener back to its containing directory. If a restored root, directory, or file is no longer accessible, Cagnard falls back to an accessible location and shows a non-blocking error.

The command bar keeps primary actions directly clickable and places related secondary actions in dropdown groups.

Copy and move use the browser pasteboard. The Copy button adds safe references to the selected entries. The user then navigates to the desired destination root/path and uses the pasteboard dropdown to copy selected staged entries there with Paste or move them there with Move here.

Paste and Move here start backend transfer tasks. When tasks exist, the command bar shows a transfer queue button next to the pasteboard. The button displays a spinner while work is active, an issue marker when a task needs attention, or a success marker when recent work completed. Its dropdown shows recent tasks with aggregate progress, latest update time, status, destination context, conflict resolve action, cancellation, queue clearing, and expandable affected-file details.

Create, rename, delete, and transfer conflict choices use app-owned modals with inline validation and keyboard handling instead of native browser dialogs.
Delete is provider-neutral from the user's perspective: deleting a folder, prefix, or object asks the active storage provider to remove that entry, including children when the entry is directory-like.

Directory listing requests are paginated by the backend. The browser sends page size, search query, sort key, sort direction, and an opaque page reference when moving forward. Previous page navigation is handled in the browser by keeping the page references visited during the current listing session. Selection is scoped to the visible page so bulk actions always apply to entries the user can inspect.

## Configuration

Browser roots come from `personalStorage` and `globalStorage` entries in backend configuration. Available actions are driven by root/account mutability and provider capabilities.

## Operational Notes

- Current-directory search and sorting are performed before page slicing by providers that can enumerate the directory exactly, such as the Unix filesystem provider.
- Providers may report exact, unknown, or degraded count and ordering accuracy. S3 default browsing uses native continuation tokens and therefore does not know the full total count up front.
- S3 search or non-name sorting scans the current prefix server-side before slicing the requested page. This provides provider-neutral behavior, but can be more expensive than native continuation-token browsing on very large prefixes.
- The file table is horizontally scrollable so provider metadata columns remain reachable on narrow panels.
- Directory navigation keeps the current listing mounted, greys it out, and shows a spinner overlay instead of inserting a transient loading row.
- The metadata panel is a side panel on wide screens and a toggleable drawer on medium and small screens.
- File type labels and icons are derived from provider MIME metadata or extension fallback classification.
- Rename is single-selection.
- Batch delete, download, pasteboard staging, and paste operate on selected entries where supported.
- Pasteboard contents are browser-session local and synchronize across active same-origin tabs when supported by the browser runtime.
- Paste availability is disabled with an inline reason for read-only destinations and invalid self-directory paste targets.
- Transfer job state is backend memory and is polled while jobs are active. Completed and canceled jobs are pruned after 1 hour.

## Known Limitations

- Provider-native search is specified but not implemented.
- Transfer retry and resumability are not implemented yet.
- Range/stream opening is represented in capabilities but not implemented by opener routes yet.
