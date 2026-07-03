## 1. Backend Operations

- [x] 1.1 Extend API models for storage operation requests, results, and preview responses.
- [x] 1.2 Extend the storage provider trait and capability model for content and lifecycle operations.
- [x] 1.3 Implement filesystem download, upload, preview, create folder, rename, delete, copy, and move with root traversal protection.
- [x] 1.4 Add backend authorization checks for read-only roots, delete confirmation, and overwrite approval.
- [x] 1.5 Add HTTP routes for content, preview, create folder, rename, delete, copy, and move.

## 2. Frontend Browser

- [x] 2.1 Extend the frontend API client for content, preview, and mutation endpoints.
- [x] 2.2 Add selected-entry state, breadcrumb navigation, and action availability helpers.
- [x] 2.3 Add toolbar actions for download, upload, create folder, rename, delete, copy, and move.
- [x] 2.4 Render text preview content for supported selected files.
- [x] 2.5 Show operation success, conflict, failure, and refresh-after-mutation feedback.

## 3. Verification

- [x] 3.1 Add backend tests for mutation success paths.
- [x] 3.2 Add backend tests for path traversal, read-only blocking, delete confirmation, and overwrite conflicts.
- [x] 3.3 Run backend tests, frontend typecheck/build, and OpenSpec validation.
