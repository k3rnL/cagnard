## Why

Cagnard can now copy and move through the browser pasteboard, including across providers. The current cross-provider fallback is still a bounded buffered operation: the backend reads a whole source file into memory, checks `maxBufferedObjectBytes`, and uploads the full byte array to the destination. That is acceptable for a prototype but it is not useful for large files, unreliable networks, object stores, or directory transfers with many large children.

Large copy and move operations also need a stronger execution model. A synchronous HTTP request cannot represent long-running progress, retry, cancellation, partial success, cleanup, or post-failure diagnostics well. Move is especially sensitive because source deletion must never happen before the destination is safely written and verified.

## What Changes

- Replace the synchronous buffered cross-provider transfer path with a streaming-capable transfer engine.
- Keep optimized provider-native copy/move paths for same-root or compatible same-provider transfers when they preserve semantics and permissions.
- Add transfer jobs and tasks for copy and move operations initiated from the pasteboard or future APIs.
- Represent each selected file or directory child as one or more transfer tasks with explicit phases: planned, waiting, reading, writing, verifying, deleting-source, completed, failed, canceled, or partial.
- Stream bytes between providers without materializing full file content in memory when source and destination capabilities allow it.
- Add provider capabilities for stream/range read, stream write, multipart upload, provider-native server-side copy, verification, retry hints, and cleanup support.
- Add bounded fallback behavior only when streaming is unavailable, with preflight size checks before reading source content.
- Support recursive directory transfers through a job plan that can report per-file and per-directory progress and failures.
- Add resumability/retry semantics where providers expose enough information, especially for multipart object-store uploads.
- Add cancellation semantics that stop future reads/writes and report any destination artifacts left behind or cleaned up.
- Improve error handling and diagnostics:
  - classify failures by phase and provider
  - preserve safe provider diagnostics without leaking credentials
  - report partial move states distinctly from copy failures
  - never delete a source item unless its destination item is successfully written and verified
  - make cleanup best-effort and visible when cleanup fails
- Add frontend job UI for queued/running/completed transfer jobs, progress, cancellation, retry, and detailed per-item failure review.
- Update configuration for transfer concurrency, chunk size, multipart thresholds, retry policy, retention of job history, and bounded fallback limits.

## Capabilities

### New Capabilities

- `transfer-job-system`: Defines durable transfer jobs, task lifecycle, progress, cancellation, retry, retention, and user-visible diagnostics.
- `streaming-transfer-engine`: Defines provider-neutral streaming, multipart, verification, cleanup, and bounded fallback behavior for large file copy/move.

### Modified Capabilities

- `cross-provider-transfer`: Replace synchronous buffered transfer as the primary cross-provider path with job-backed streaming transfer, while retaining conflict policies and copy/move semantics.
- `browser-pasteboard`: Start copy/move as transfer jobs and show job status instead of treating paste as a single synchronous operation.
- `storage-plugin-system`: Extend provider contracts with stream read/write, multipart, server-side copy, verification, retry, and cleanup capabilities.
- `storage-browser`: Add transfer job status surfaces and action states for long-running copy/move.
- `stateless-backend-configuration`: Define how job state is handled in a backend that is currently stateless, including what can be in-memory first and what requires optional external persistence later.

## Impact

- Backend API: add job creation, job detail, job event/progress, cancel, retry, and cleanup endpoints while preserving compatibility paths for simple operations.
- Backend transfer service: introduce a scheduler/executor abstraction, task planning, streaming IO, retry policy, verification hooks, cancellation handling, and structured result reporting.
- Storage providers: implement stream read/write for Unix filesystem first; implement S3 multipart upload/download/copy paths where practical; keep unsupported capabilities explicit.
- Frontend browser: update pasteboard execution to start a transfer job, show progress and completion/failure states, and expose cancel/retry/details actions.
- Configuration: add transfer engine settings for concurrency, chunk sizes, multipart thresholds, retry policy, buffered fallback limits, and job retention.
- Tests: add large-file tests that prove cross-provider transfer does not buffer entire content, move does not delete sources on failed writes, cancellation is safe, and recursive failures are reported per child.
- Documentation/specs: distinguish provider-native copy, streaming backend transfer, multipart transfer, bounded fallback, transfer jobs, task status, and failure recovery behavior.
