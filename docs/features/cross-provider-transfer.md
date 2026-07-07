# Cross-Provider Transfer

## Behavior

Cagnard transfers files and directories between storage roots through provider-neutral source and destination references. The browser pasteboard is the primary UI for this flow: users stage source references, navigate to a destination, then choose Paste or Move here for the active root/path.

The backend transfer service supports:

- same-root optimized file copy and move when provider semantics are safe
- backend-mediated copy across roots/providers using streaming read/write when both providers support it
- bounded buffered fallback using source download and destination upload only when streaming is unavailable and the source is within configured limits
- recursive directory copy through source listing, destination directory creation, and child transfer
- move as copy-then-delete, with source deletion only after destination success
- recursive fail-policy preflight so conflicts in child paths block before a transfer job starts writing
- per-item and per-child result reporting
- conflict policies: fail/ask, skip, keep both, and replace
- configurable bounded transfer limits via `maxBufferedObjectBytes` from root or provider settings
- configurable recursive transfer concurrency via `tasks.maxConcurrentTransfers`, defaulting to 4
- in-memory transfer jobs for pasteboard copy and move requests

## API Shape

Paste execution uses `POST /api/storage/transfer/jobs`.

The request includes:

- operation selected at execution time: copy or move
- source entries with tunnel, root id, and path
- destination tunnel, root id, and path
- conflict policy

The response returns a transfer task id, normalized status, task list, progress counters, and any immediate per-item results such as `conflict`, `failed`, or `blocked`.

Additional job endpoints:

- `GET /api/storage/transfer/jobs`
- `GET /api/storage/transfer/jobs/{jobId}`
- `POST /api/storage/transfer/jobs/{jobId}/resolve`
- `POST /api/storage/transfer/jobs/{jobId}/cancel`
- `POST /api/storage/transfer/jobs/clear`

The compatibility endpoint `POST /api/storage/transfer` still returns the older synchronous `TransferResponse` and is kept for simple integrations and tests.

## Conflict Handling

Transfers do not overwrite by default. The first paste attempt uses fail-on-conflict behavior. If a destination exists, the backend returns the accepted task as `blocked`, the frontend asks the user whether to Skip, Keep both, or Replace, then resolves that same task id with the selected policy.

Keep both creates predictable names such as `note copy.txt`, `note copy 2.txt`, or `folder copy`.

For directory transfers, fail-on-conflict preflight checks the source tree recursively. This catches conflicts under implicit object-store prefixes before a background transfer job starts writing, so the same conflict modal can be used for top-level and nested conflicts.

## Operational Notes

- Transfer authorization uses the same user identity, tunnel, and root access checks as browsing and mutation routes.
- Provider credentials remain backend-side; the frontend never downloads and re-uploads transfer bytes.
- The service blocks moving an entry onto itself and blocks copying or moving a directory into its own subtree.
- A move that copies successfully but cannot delete the source returns partial success.
- Filesystem and S3 provider-neutral transfers stream through bounded pipes instead of buffering whole files in memory when both endpoints support streaming.
- If streaming is unavailable, known source size is checked against `maxBufferedObjectBytes` before download.
- Transfer jobs are currently stored in backend memory and are lost on backend restart.
- Completed and canceled transfer jobs are pruned from backend memory after 1 hour.

## Known Limitations

- S3 multipart transfer is not implemented yet; S3 streaming writes use single-object upload requests.
- Retry and resumability are not implemented yet.
- Cancellation is cooperative and may not abort every provider operation until providers expose stronger cancellation hooks.
- Provider-specific metadata preservation is not implemented beyond what upload/copy operations naturally retain.
- Recursive object-store behavior depends on the provider's listing and folder marker semantics.
