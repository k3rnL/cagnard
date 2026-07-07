# Design

## Approach

Keep the existing in-memory transfer job model, but normalize it into the task queue contract used by the UI:

- backend job statuses become `pending`, `blocked`, `running`, `completed`, `canceled`, or `error`;
- a blocked transfer stores the original request with the visible job id;
- conflict resolution posts a decision to that existing job id and resumes the same job;
- canceling a blocked or active job marks that same job as `canceled`;
- terminal completed/canceled jobs are pruned from backend memory after 1 hour;
- the frontend removes selected pasteboard items after the initial job is accepted;
- the frontend task queue expands jobs and paginates affected-file/task rows client-side for the first implementation.

## Backend API

Add `POST /api/storage/transfer/jobs/{jobId}/resolve` with body:

```json
{ "conflictPolicy": "skip|keep-both|replace" }
```

The endpoint validates ownership, validates that the job is currently `blocked`, updates the original request's conflict policy, resets non-terminal task progress to pending, and restarts the transfer under the same job id.

Add `POST /api/storage/transfer/jobs/clear` to remove terminal jobs from the visible queue for the current user without canceling active jobs.

## UI

The transfer queue button remains next to the pasteboard. Its dropdown becomes a compact task manager:

- clear terminal tasks;
- cancel active or blocked tasks;
- expand each task to see affected files;
- show task status, aggregate progress, updated time, destination, and safe errors;
- show conflict decisions for blocked jobs in the existing app-owned modal;
- paginate expanded file rows for large result trees.

## Notes

Per-file progress is best-effort for the current providers. File-level byte progress is available for direct file transfer tasks. Recursive directory children are exposed as task/result rows when known, with pagination in the UI.

Follow-on refinements:

- recursive directory transfer tasks register child rows as entries are discovered, then update each child row while it transfers;
- parent directory task counters are recomputed from child task counters;
- `tasks.maxConcurrentTransfers` controls recursive child transfer concurrency and defaults to 4;
- S3-compatible providers implement provider-neutral stream read/write for transfer progress without whole-object buffering;
- the task-detail UI focuses expanded lists on leaf affected items, and pasteboard actions stay pinned while long staged-entry lists scroll.
