# Task API Reference

All routes require the same [authenticated session](identity-and-sessions.md) as storage browsing. Tasks are scoped to the canonical principal, including its login provider. A missing or expired session returns `401`; a foreign, removed, or no-longer-retained task returns `404`.

Every `POST` and `PUT`, including cancellation and upload item bodies, also requires `Origin: <auth.publicUrl>` and `X-Cagnard-Request: 1`. Bearer tokens are not supported. Storage grants are checked for the requested operation; see the [action matrix](authorization.md#effective-permissions-and-operation-composition).

For the user workflow, see [browsing and file operations](../guides/browsing-and-transfers.md); for ownership, deadlines, and partial effects, see [task architecture](../architecture/tasks.md).

## Common Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/tasks` | List retained tasks for the current user |
| `GET` | `/api/tasks/{taskId}` | Read one task summary |
| `GET` | `/api/tasks/{taskId}/items?pageSize=100&pageRef=...` | Read a page of affected items |
| `POST` | `/api/tasks/{taskId}/cancel` | Cooperatively cancel active work |
| `POST` | `/api/tasks/{taskId}/resolve` | Resolve a blocked conflict on the same task ID |
| `POST` | `/api/tasks/clear` | Remove terminal tasks for the current user |

Task summaries include `id`, `operation`, `status`, `revision`, timestamps, `message`, `progress`, `mutationCount`, optional `initiatedFrom`, optional `destination`, and optional `download`. List and detail summaries do not embed recursive items; use the paginated items route for `id`, `parentId`, `depth`, paths, kind, status, message, and progress. Creation and conflict-resolution responses may include the stable item records needed to deliver browser-fed uploads.

## Create Operations

### Copy Or Move

`POST /api/tasks/transfers`

```json
{
  "sources": [
    { "intent": "copy", "tunnel": "personal", "rootId": "home", "path": "report.pdf" }
  ],
  "destination": { "tunnel": "global", "rootId": "shared", "path": "reports" },
  "initiatedFrom": { "tunnel": "personal", "rootId": "home", "path": "" },
  "conflictPolicy": "fail"
}
```

### Delete

`POST /api/tasks/deletes` accepts `sources`, an `initiatedFrom` location, and `confirmed: true`. Deletion can be partially complete when canceled.

### Download

`POST /api/tasks/downloads` accepts storage `sources`. The returned `download.url` is consumed with a native authenticated `GET`. A single file is streamed directly; folders or multiple sources produce an incremental ZIP.

A source `path` may be the empty string only to identify the authorized configured storage root. Cagnard treats it as a synthetic directory named from the root's display label, then traverses the complete filesystem root or S3 bucket prefix through provider-neutral list and stream capabilities. It does not treat an empty path as an S3 object, expose the host filesystem path, or infer contents from a paginated browser listing. Absolute paths and parent traversal remain invalid.

`GET /api/tasks/{taskId}/content` can be consumed once while the task is pending. Single files support one standard byte range. Terminal, stale, or foreign URLs are rejected.

### Upload

`POST /api/tasks/uploads` accepts `destination`, `initiatedFrom`, `conflictPolicy`, and a manifest:

```json
{
  "destination": { "tunnel": "personal", "rootId": "home", "path": "incoming" },
  "initiatedFrom": { "tunnel": "personal", "rootId": "home", "path": "incoming" },
  "conflictPolicy": "fail",
  "items": [
    { "relativePath": "dataset/", "kind": "directory" },
    { "relativePath": "dataset/part-1.parquet", "kind": "file", "size": 1048576, "mimeType": "application/vnd.apache.parquet" }
  ]
}
```

After conflicts are resolved, stream each pending item with `PUT /api/tasks/{taskId}/uploads/{itemId}`. Do not resend a completed or running item. Relative paths reject absolute paths and parent traversal.

## Conflict Decisions

The resolve body is `{ "conflictPolicy": "skip" | "keep-both" | "replace" }`. `fail` is the creation-time policy that blocks; it is not a resolution. Cancel the task to abandon the decision. Resolution requires current authentication and grants. A blocked transfer with prior storage effects returns `409` with `partial_task_requires_new_request`; submit a new request for the remaining work instead. Terminal tasks cannot be restarted.

## Errors and lifetime

| Status | Meaning |
| --- | --- |
| `401` | Authentication is missing, invalid, or expired; sign in again. |
| `403` | The origin/header check failed, or a required action was not granted. |
| `404` | Root/task is unavailable to this principal, or retained task state is gone. |
| `409` | The current task state does not allow this operation, such as reusing a completed download. |

An accepted task can later end in `error`, `partial`, or `canceled`; an HTTP success on creation does not mean the storage operation completed. Inspect task status and item results. Restarting the backend loses task state, and authentication expiry cancels its execution context without undoing completed effects.

## Compatibility Routes

The existing `/api/storage/transfer/jobs` list, detail, cancel, resolve, clear, and creation routes address the same in-memory copy/move records. They are compatibility aliases and are scheduled for removal after clients migrate to `/api/tasks`. New integrations must use the generic routes.
