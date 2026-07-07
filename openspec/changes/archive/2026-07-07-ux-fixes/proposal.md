# Proposal: UX Fixes

## Why

Two core navigation details are currently surprising:

- Opening a file replaces the list with the opener, but the breadcrumb still represents only the containing directory, so the visible path does not describe the current view.
- Cagnard updates its own location state and URL, but native browser Back and Forward navigation do not reliably restore previous storage locations or opened-file views.

These are browser workflow issues. Fixing them makes Cagnard feel like a normal web application without changing storage provider behavior.

## Goals

- Show the opened file name as the final breadcrumb segment when a file is opened in the page-level opener.
- Let the file-name breadcrumb represent the current opened file view without making it look like a navigable directory.
- Make native browser Back and Forward buttons restore Cagnard navigation state for roots, directories, and opened file views.
- Keep storage access checks and provider-neutral route behavior unchanged.

## Non-Goals

- Do not add server-side navigation persistence.
- Do not change the storage API contract unless a small frontend-only URL format adjustment is insufficient.
- Do not make inline quick-view rows part of browser history.
- Do not redesign breadcrumbs beyond the opened-file segment behavior.

## Scope

### Opened File Breadcrumb

When a file is opened as the main page view, the breadcrumb trail should include the directory ancestors and the opened file name as the current terminal segment. Ancestor breadcrumbs remain navigable. The opened file breadcrumb segment is current-state display and should not navigate as a directory.

Closing the file or navigating to another directory should return the breadcrumb trail to the directory path.

### Native Browser History

Cagnard should push or replace browser history entries when the active storage location changes through root selection, breadcrumb navigation, directory opening, direct URL restore, and page-level file opening.

The browser should listen for native `popstate` events and restore the matching Cagnard state. Back and Forward should work across:

- root changes
- directory navigation
- breadcrumb navigation
- page-level file opening
- closing an opened file back to its containing directory

The existing readable URL approach can remain: stable query parameters identify `tunnel`, `rootId`, and `path`; the readable hash remains human-oriented. If needed, the URL can include an explicit opened-file state parameter to distinguish an opened file from browsing its parent directory.

## Risks

- Pushing history on every internal state reconciliation can create duplicate entries or loops. The implementation should distinguish user-initiated navigation from URL restoration.
- File paths and directory paths share the same string shape. Opened-file state must be explicit enough that reload/back can restore the opener when the file still exists.
- If an opened file is no longer accessible, restore should fall back safely to its containing directory and show a non-blocking error.

## Validation

- Open a file and verify the breadcrumb ends with the file name.
- Use breadcrumb ancestors from an opened file and verify they navigate to directories.
- Navigate through several directories and files, then use browser Back and Forward to restore each location.
- Reload an opened-file URL and verify the file opens when authorized and available.
- Verify inline quick-view does not create native browser history entries.
- Run frontend typecheck/build.
