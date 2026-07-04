# Storage Browser

## Behavior

The storage browser provides a provider-neutral view of roots, directories, files, and objects. It supports:

- personal and global navigation areas
- breadcrumbs
- single and multi-selection
- current-directory filtering
- sorting by name, kind, file type, size, modified time, and MIME type
- metadata inspection
- unified open action for folders and files
- explicit in-app file opening through compatible opener plugins
- inline quick opening from the file row
- create file, upload, download, create folder, rename, delete, add to pasteboard, paste, and move from pasteboard

Downloads return raw file bytes through the backend content endpoint.

Selecting a file does not fetch file content. The user opens a file explicitly, and Cagnard routes that request through the opener registry after checking file type, size, storage capabilities, and write-back permissions.

The main Open action is shared by folders and files. Opening a folder navigates into it. Opening a file replaces the list view with the opener surface while keeping breadcrumbs and the main storage actions available. File rows swap the file icon for a hover quick-view button that inserts the same opener surface inline between the current row and the next row.

The root breadcrumb uses the selected storage root display label. The command bar keeps primary actions directly clickable and places related secondary actions in dropdown groups.

Copy and move use the browser pasteboard. The Copy button adds safe references to the selected entries. The user then navigates to the desired destination root/path and uses the pasteboard dropdown to copy selected staged entries there with Paste or move them there with Move here.

Create, rename, delete, and transfer conflict choices use app-owned modals with inline validation and keyboard handling instead of native browser dialogs.

## Configuration

Browser roots come from `personalStorage` and `globalStorage` entries in backend configuration. Available actions are driven by root/account mutability and provider capabilities.

## Operational Notes

- Current search/filtering is scoped to loaded entries in the active directory.
- The file table is horizontally scrollable so provider metadata columns remain reachable on narrow panels.
- The metadata panel is a side panel on wide screens and a toggleable drawer on medium and small screens.
- File type labels and icons are derived from provider MIME metadata or extension fallback classification.
- Rename is single-selection.
- Batch delete, download, pasteboard staging, and paste operate on selected entries where supported.
- Pasteboard contents are browser-session local and synchronize across active same-origin tabs when supported by the browser runtime.
- Paste availability is disabled with an inline reason for read-only destinations and invalid self-directory paste targets.

## Known Limitations

- Provider-native search is specified but not implemented.
- Pasteboard transfer uses bounded backend-mediated reads/writes; streaming progress and resumable background jobs are not implemented yet.
- Range/stream opening is represented in capabilities but not implemented by providers yet.
