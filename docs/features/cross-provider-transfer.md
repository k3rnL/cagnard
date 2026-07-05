# Cross-Provider Transfer

## Behavior

Cagnard transfers files and directories between storage roots through provider-neutral source and destination references. The browser pasteboard is the primary UI for this flow: users stage source references, navigate to a destination, then choose Paste or Move here for the active root/path.

The backend transfer service supports:

- same-root optimized file copy and move when provider semantics are safe
- backend-mediated copy across roots/providers using streaming read/write when both providers support it
- bounded buffered fallback using source download and destination upload only when streaming is unavailable and the source is within configured limits
- recursive directory copy through source listing, destination directory creation, and child transfer
- move as copy-then-delete, with source deletion only after destination success
- per-item and per-child result reporting
- conflict policies: fail/ask, skip, keep both, and replace
- configurable bounded transfer limits via `maxBufferedObjectBytes` from root or provider settings
- in-memory transfer jobs for pasteboard copy and move requests

## API Shape

Paste execution uses `POST /api/storage/transfer/jobs`.

The request includes:

- operation selected at execution time: copy or move
- source entries with tunnel, root id, and path
- destination tunnel, root id, and path
- conflict policy

The response returns a transfer job id, status, task list, progress counters, and any immediate per-item results such as `conflict`, `failed`, or `blocked`.

Additional job endpoints:

- `GET /api/storage/transfer/jobs`
- `GET /api/storage/transfer/jobs/{jobId}`
- `POST /api/storage/transfer/jobs/{jobId}/cancel`

The compatibility endpoint `POST /api/storage/transfer` still returns the older synchronous `TransferResponse` and is kept for simple integrations and tests.

## Conflict Handling

Transfers do not overwrite by default. The first paste attempt uses fail-on-conflict behavior. If a destination exists, the frontend asks the user whether to Skip, Keep both, or Replace, then retries the batch with the selected policy.

Keep both creates predictable names such as `note copy.txt`, `note copy 2.txt`, or `folder copy`.

## Operational Notes

- Transfer authorization uses the same user identity, tunnel, and root access checks as browsing and mutation routes.
- Provider credentials remain backend-side; the frontend never downloads and re-uploads transfer bytes.
- The service blocks moving an entry onto itself and blocks copying or moving a directory into its own subtree.
- A move that copies successfully but cannot delete the source returns partial success.
- Filesystem-to-filesystem provider-neutral transfers stream through bounded pipes instead of buffering whole files in memory.
- If streaming is unavailable, known source size is checked against `maxBufferedObjectBytes` before download.
- Transfer jobs are currently stored in backend memory and are lost on backend restart.

## Known Limitations

- S3 generic cross-provider streaming and multipart transfer are not implemented yet; same-root S3 object copy remains provider-native.
- Retry and resumability are not implemented yet.
- Cancellation is cooperative and may not abort every provider operation until providers expose stronger cancellation hooks.
- Provider-specific metadata preservation is not implemented beyond what upload/copy operations naturally retain.
- Recursive object-store behavior depends on the provider's listing and folder marker semantics.
