## Context

Cagnard's current pasteboard transfer endpoint executes copy and move synchronously. Cross-provider fallback reads an entire source file into an `Array[Byte]`, applies the buffered limit after reading for some providers, then uploads the full byte array to the destination. Same-root filesystem copy and S3 object copy are already optimized by provider-native operations, but provider-neutral transfers are not large-file safe.

The backend is intentionally stateless: it must run without a required application database. This change therefore starts with in-memory transfer jobs and explicit restart limitations, while keeping the provider and API shapes open for an optional external job store later.

## Decisions

### 1. Add jobs without removing the synchronous compatibility endpoint

`POST /api/storage/transfer` remains available and returns the existing `TransferResponse`. A new job API starts asynchronous transfer jobs:

- `POST /api/storage/transfer/jobs`
- `GET /api/storage/transfer/jobs`
- `GET /api/storage/transfer/jobs/{jobId}`
- `POST /api/storage/transfer/jobs/{jobId}/cancel`

The frontend pasteboard should use the job API. Existing backend tests and simple integrations can keep using the synchronous endpoint during the transition.

### 2. Use in-memory job state first

Jobs are stored in-memory in the backend process. This satisfies the stateless startup requirement and makes the limitation explicit: active jobs are not recovered after restart and multi-replica coordination requires a future external job store.

### 3. Stream only when both providers support it

The provider contract gets streaming hooks in addition to the existing byte-array `download` and `upload`. The filesystem provider implements true stream read/write. Providers without stream support remain bounded fallback participants.

### 4. Preserve provider-native optimized paths

Same-root file copy/move continues to use provider-native `copy`/`move`. This keeps filesystem `Files.copy` and S3 `CopyObject` paths efficient and avoids unnecessary backend byte routing.

### 5. Preflight before bounded fallback

When streaming is unavailable, the transfer engine uses source metadata size to reject oversized fallback before calling `download`. Unknown sizes remain eligible only if the actual buffered content stays within the configured limit.

### 6. Move deletion remains last

Move continues to mean "copy/write destination first, then delete source only after destination success." The first implementation verifies destination by successful provider upload/stat semantics; checksum-level verification remains future work.

## Risks / Trade-offs

- In-memory jobs are not durable. The UI and docs must not imply restart recovery.
- Cancellation is cooperative. It can stop future tasks and chunked filesystem streaming, but cannot abort every provider operation until provider-specific cancellation hooks exist.
- S3 multipart streaming is not implemented in the first pass. Same-root S3 copy remains optimized; cross-provider S3 transfer may still be bounded fallback until stream/multipart client methods are added.
- Job progress starts with phase/task/result visibility. Fine-grained byte progress depends on provider streaming hooks and may be approximate.

## Migration Plan

1. Extend API models with transfer job responses and task status.
2. Extend storage capabilities and provider contract with streaming read/write and size preflight hooks.
3. Implement filesystem streaming hooks.
4. Refactor transfer fallback to use streaming when possible and preflight bounded fallback before download.
5. Add an in-memory job manager inside `ApiService`.
6. Expose transfer job routes.
7. Update the frontend pasteboard to start jobs, poll recent jobs, and show job status.
8. Add backend/frontend tests and update docs.
