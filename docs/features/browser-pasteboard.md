# Browser Pasteboard

## Behavior

The browser pasteboard is a session-only frontend feature for copy and move. Users select entries, add safe source references to the pasteboard, navigate to any accessible destination root or provider, then choose Paste or Move here for the current location.

The pasteboard stores safe references only:

- source tunnel and root id
- source path and entry metadata
- root label, provider family, provider id, account id
- selected state for batch paste

It does not store provider credentials, session tokens, downloaded bytes, or server-side state.

## Session And Tabs

Pasteboard contents stay in browser memory. They survive in-app navigation and can synchronize across active same-origin tabs for the same authenticated user with `BroadcastChannel`.

They do not persist across a full browser restart. Logout or user change clears or isolates the pasteboard.

## Paste Execution

Paste uses the active storage root and current path as the destination. The selected pasteboard action provides the operation: Paste copies entries and Move here copies entries then deletes sources only after destination success. The frontend sends selected pasteboard entries to the backend transfer API, and the backend performs provider-neutral reads, writes, recursive directory planning, conflict handling, and safe move deletion.

The dropdown shows staged item count, selected item count, source context, per-item removal, clear all, and copy/move availability. It disables paste or move with an eligibility reason when the current destination is read-only, the source cannot be deleted for a move, or a folder would be pasted into itself.

## Conflict Handling

The first transfer request uses fail-on-conflict semantics. If a destination conflict is returned, Cagnard opens a conflict modal with standard file-browser choices:

- Skip
- Keep both with predictable auto-renaming
- Replace

The selected policy is applied to the batch retry.

## Known Limitations

- Pasteboard state is not a background job queue.
- Transfers are currently bounded buffered operations; streaming, resumability, cancellation, and byte-level progress are future work.
- Staged references can become stale if source entries are deleted or permissions change; stale items are validated at paste time.
