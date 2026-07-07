# Design: UX Fixes

## Approach

The fixes are frontend state and URL coordination work. The backend already exposes enough information to list, stat, preview, and download entries. The browser state hook should remain the owner of active root/path/opened-file state, while the visual component only renders breadcrumbs and dispatches navigation actions.

## Opened File Breadcrumb

Breadcrumb generation should support a current opened file in addition to the directory path.

When the page-level opener is active:

- directory crumbs are generated from the opened file's parent path
- the final crumb uses the opened file name and full file path
- ancestor crumbs remain clickable
- the final file crumb is marked current and should not call `navigateToPath` as a directory

Inline quick-view should not affect the breadcrumb because the user is still browsing the directory list.

## History State Model

Store a compact browser history state object for Cagnard routes:

```ts
{
  tunnel: "personal" | "global";
  rootId: string;
  path: string;
  openedFilePath?: string;
}
```

Directory browsing uses `path` only. Page-level file opening uses `path` as the parent directory and `openedFilePath` as the file path.

The URL should preserve existing stable restore query parameters and readable hash. For opened files, add an explicit query parameter such as `openedFilePath` or equivalent state so the file opener can be restored after reload or native history traversal.

## Push, Replace, And Pop

Use `history.replaceState` for initial restore and state normalization. Use `history.pushState` for user-initiated navigation events:

- selecting a root
- opening a directory
- using breadcrumbs
- opening a file as a page-level opener
- closing a page-level opener back to its containing directory

Use a guard ref while processing `popstate` so restoring state does not immediately push a new entry.

On `popstate`, resolve the target root from navigation data, update the current path, clear page-scoped selection, and either:

- open the referenced file if `openedFilePath` is present and accessible
- show the directory listing when no opened file is present

If the opened file cannot be restored, keep the directory path and show a non-blocking error.

## Validation Notes

The highest-risk bug class is duplicate history entries caused by effects observing state changes. Implementation should be validated with manual browser Back/Forward usage in the in-app browser after frontend typecheck/build.
