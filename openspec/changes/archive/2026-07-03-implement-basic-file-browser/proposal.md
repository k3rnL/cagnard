## Why

Cagnard currently proves client/server browsing and filesystem listing, but it is not yet useful as a file browser because users cannot perform basic file lifecycle operations. This change turns the prototype into a practical single-provider file browser while preserving the capability-driven plugin model.

## What Changes

- Add file and directory selection in the browser UI.
- Add breadcrumb navigation for the current storage path.
- Add backend and frontend support for download, upload, create folder, rename, delete, copy, and move within the current storage root.
- Add text preview for supported files through the existing UI plugin path.
- Add operation feedback for success, failure, conflict, denied capability, and refresh-after-mutation behavior.
- Add overwrite/conflict handling for upload, copy, and move.
- Enforce read-only account behavior and path traversal protection for mutation APIs.
- Keep scope to a useful single-provider filesystem browser; cross-provider transfer remains out of scope for this change.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `storage-browser`: Add concrete browser interactions for selection, breadcrumbs, preview, mutation actions, conflict feedback, and refresh behavior.
- `storage-plugin-system`: Extend canonical filesystem provider operations from listing/stat into basic file lifecycle operations and content streaming.
- `secure-account-management`: Clarify read-only and sensitive-operation policy enforcement for filesystem mutations.
- `ui-plugin-system`: Connect the text preview plugin path to actual file content preview behavior for supported text files.

## Impact

- Backend API surface expands with mutation and content endpoints.
- Filesystem provider gains download, upload, mkdir, rename, delete, copy, and move support.
- Frontend browser state expands to selected entries, breadcrumbs, dialogs/forms, operation status, and preview content.
- Backend tests need coverage for path traversal, read-only accounts, conflicts, and filesystem mutations.
- Frontend build/type checks need to cover the richer file-browser UI.
