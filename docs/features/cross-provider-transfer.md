# Cross-Provider Transfer

## Behavior

Cagnard transfers files and directories between storage roots through provider-neutral source and destination references. The browser pasteboard is the primary UI for this flow: users stage source references, navigate to a destination, then choose Paste or Move here for the active root/path.

The backend transfer service supports:

- same-root optimized file copy and move when provider semantics are safe
- backend-mediated copy across roots/providers using source download and destination upload
- recursive directory copy through source listing, destination directory creation, and child transfer
- move as copy-then-delete, with source deletion only after destination success
- per-item and per-child result reporting
- conflict policies: fail/ask, skip, keep both, and replace
- configurable bounded transfer limits via `maxBufferedObjectBytes` from root or provider settings

## API Shape

Paste execution uses `POST /api/storage/transfer`.

The request includes:

- operation selected at execution time: copy or move
- source entries with tunnel, root id, and path
- destination tunnel, root id, and path
- conflict policy

The response returns overall success plus per-item results such as `copied`, `moved`, `skipped`, `conflict`, `failed`, or `partial`.

## Conflict Handling

Transfers do not overwrite by default. The first paste attempt uses fail-on-conflict behavior. If a destination exists, the frontend asks the user whether to Skip, Keep both, or Replace, then retries the batch with the selected policy.

Keep both creates predictable names such as `note copy.txt`, `note copy 2.txt`, or `folder copy`.

## Operational Notes

- Transfer authorization uses the same user identity, tunnel, and root access checks as browsing and mutation routes.
- Provider credentials remain backend-side; the frontend never downloads and re-uploads transfer bytes.
- The service blocks moving an entry onto itself and blocks copying or moving a directory into its own subtree.
- A move that copies successfully but cannot delete the source returns partial success.

## Known Limitations

- Streaming, resumability, cancellation, and byte-level progress are not implemented yet.
- Provider-specific metadata preservation is not implemented beyond what upload/copy operations naturally retain.
- Recursive object-store behavior depends on the provider's listing and folder marker semantics.
