# Proposal: Improve UI User Experience

## Why

Cagnard is now usable as a multi-provider file browser, but some daily interactions still feel rough or unsafe. Path sharing is not ergonomic, navigation state is not reflected in the URL, inline notifications can cause accidental file opening, loading feedback is visually disruptive, opening behavior should be one-click, and JSON file opening regressed after the Go backend refactor.

These are user-experience issues in the core browser workflow. Fixing them improves confidence and speed without changing the provider-neutral storage model.

## Goals

- Add a hidden-by-default breadcrumb action that appears on breadcrumb hover and copies the current full user-visible path to the browser clipboard.
- Keep the current storage location in the URL using readable user-facing names rather than opaque internal ids where practical.
- Replace file-list inline notifications and errors with non-blocking toast notifications.
- Replace the current `Loading` row/line during navigation or file opening with a smoother pending-state transition that greys out the current content and shows a light spinner.
- Keep opening a file or directory as a one-click action.
- Fix the JSON/MIME regression so JSON files open in the expected JSON/text opener after the Go backend rewrite.

## Non-Goals

- Do not introduce a backend persistence layer.
- Do not change storage provider identifiers or provider authorization semantics.
- Do not redesign the full application shell.
- Do not make URL paths a security boundary; backend access checks remain authoritative.

## Scope

### Breadcrumb Copy Path

The breadcrumb component should expose a copy-path button at the end of the breadcrumb trail only while the breadcrumb area is hovered or focused. Activating it copies the full path using real, user-facing names, including the visible root name and path segments.

The copied value should be suitable for a user to paste in chat, tickets, docs, or another browser tab. This is separate from the Cagnard file pasteboard.

### Readable URL Location

The browser URL should reflect the current location using readable names for the user-visible storage location. Reloading or opening the URL in another tab should restore the same location when the user has access.

The implementation must still preserve stable internal ids in application state as needed, because display names may not be globally unique across all providers and roots.

### Toast Notifications

Notifications and errors should no longer appear above the file list. They should appear in a toaster-style surface outside the file list layout so dismissing or replacing a notification cannot shift the list and cause an accidental click on a file.

### Navigation And Opening Transition

Opening a directory or file should not insert a `Loading` line into the file list. The existing content should stay in place, become visually pending/disabled, and show a lightweight spinner. If cancellation can be implemented cleanly for the current request model, a cancel action may be added, but the smooth transition is the priority.

### One-Click Opening

Clicking a directory row opens the directory. Clicking a file row opens the file in the application. Selection controls and inline preview/open affordances must remain distinct so users can still select multiple entries without accidentally navigating.

### JSON/MIME Regression

JSON files should be recognized consistently from backend metadata, file extensions, and frontend opener matching. The JSON opener should work again after the Go backend rewrite, including for files whose backend MIME type is `application/json` or whose extension is `.json`.

## Impacted Areas

- `frontend/src/components/StorageBrowser.tsx`
- `frontend/src/api/client.ts`
- `frontend/src/api/types.ts`
- `frontend/src/plugins/fileOpeners.ts`
- `frontend/src/plugins/fileTypeCatalog.ts`
- `frontend/src/styles/app.css`
- Go backend content/stat/preview MIME metadata if the regression is backend-side
- Feature docs for storage browsing, action modals/notifications, and file compatibility

## Risks

- Readable URLs can be ambiguous if two roots or path segments have the same display name. The implementation should use readable paths for UX while retaining internal ids or fallback query parameters where needed.
- Browser clipboard access requires a user gesture and may fail in insecure contexts; failures should show a toast.
- One-click open must not break multi-selection workflows. Checkbox clicks, row selection modifiers, and inline preview actions must stop propagation clearly.
- Pending-state overlays must not block critical controls such as navigation cancellation or toast dismissal.

## Validation

- Verify breadcrumb hover/focus reveals copy path and copies the expected readable path.
- Verify URL updates while browsing, survives reload, and opens the same location in a new tab when authorized.
- Verify notifications appear as toasts and do not shift the file list.
- Verify navigation/opening pending states do not insert a `Loading` row.
- Verify files and directories open with one click while checkbox selection still works.
- Verify `.json` files open with the JSON/text opener and MIME metadata is correct.
- Run frontend typecheck/build and relevant backend tests if MIME handling is changed.
