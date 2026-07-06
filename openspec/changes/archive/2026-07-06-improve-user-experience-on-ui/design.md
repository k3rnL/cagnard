# Design: Improve UI User Experience

## Approach

The implementation keeps UX state in the frontend and does not change the provider-neutral storage API contract. The browser state hook owns location restoration and URL updates because it already owns the selected root and current path. The visual browser component owns copy-to-clipboard feedback, row activation, toasts, and pending presentation because these are UI-only concerns.

## Readable URL Strategy

Cagnard writes stable restore parameters into the query string:

- `tunnel`
- `rootId`
- `path`

It also writes a readable hash path:

- `#/personal/Home/folder/file`
- `#/global/Shared/folder/file`

The query parameters are authoritative when present because root labels may collide. The hash is intentionally readable for humans and can restore a location only when it resolves unambiguously for the authenticated user.

## Clipboard Path

The breadcrumb copy action copies `RootLabel/path/to/location`. This is intentionally user-facing and independent from the Cagnard pasteboard. Browser clipboard failures are reported through toasts.

## Notifications

Success and error messages emitted by browser actions are rendered as fixed toasts. This avoids changing the file-list layout while the user is clicking. Toasts auto-dismiss, can be manually dismissed, and use live-region semantics without moving focus.

## Pending States

Directory loads keep the current listing mounted, grey it out, and show a lightweight spinner overlay. File opening keeps the opener shell stable and shows an opener-level spinner. The current request layer does not expose a reliable abort handle, so cancel is deferred.

## File Opening

Normal row click opens a file or directory. Checkbox clicks, inline quick view, keyboard Space selection, and modifier-key row clicks remain selection-oriented so multi-selection remains usable.

## MIME Compatibility

The Go file type classifier now normalizes MIME parameters and maps exact JSON/media types before generic top-level media handling. The frontend catalog and opener matcher also normalize MIME parameters so plugin and provider metadata remain tolerant of values like `application/json; charset=utf-8`.
