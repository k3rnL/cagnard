## Context

Cagnard currently lists configured filesystem roots and shows normalized metadata, but it cannot yet mutate files or preview content. The next useful slice should make the Unix filesystem provider behave like a basic file browser while preserving stateless configuration, provider capability checks, and the plugin-oriented UI direction.

## Goals / Non-Goals

**Goals:**

- Add concrete filesystem operations for download, upload, create folder, rename, delete, copy, and move within the current storage root.
- Add a text preview path for small text files.
- Add frontend selection, breadcrumbs, action buttons, confirmation/prompt dialogs, upload input, and operation feedback.
- Enforce read-only roots and path traversal protection before mutation.
- Refresh listings after successful mutations.
- Add backend coverage for mutation success, conflict handling, read-only blocking, and path traversal blocking.

**Non-Goals:**

- Cross-provider transfer.
- Multi-select batch operations.
- Recursive directory copy.
- Persisted transfer queue or resumable uploads.
- Rich binary previews or in-browser file editing.

## Decisions

### Use operation-specific HTTP endpoints

The backend will expose operation-specific endpoints under `/api/storage`: raw content endpoints for download/upload/preview and JSON endpoints for folder creation, rename, delete, copy, and move. This is easier to test and reason about than a generic operation command endpoint, while still keeping provider operations behind a common Scala trait.

### Keep operations scoped to one root

Copy and move in this change operate inside the current resolved storage root. Cross-root and cross-provider transfer stays reserved for the transfer engine because it needs capability negotiation, metadata preservation policy, and longer-running progress semantics.

### Require explicit overwrite flags

Upload, copy, and move require an explicit `overwrite=true` flag when the target exists. The default behavior is conflict failure. This matches the existing sensitive-operation posture and avoids silent data loss.

### Implement text preview as a bounded content read

The preview endpoint reads text files only when the provider can download content, the MIME type or extension is text-like, and the file is within a configured hard limit. The first implementation uses a fixed backend limit.

### Keep the frontend dense and operational

The Refine app remains the shell, but the browser surface becomes a focused operational tool: breadcrumb path, action toolbar, selected-entry metadata, preview panel, and inline operation feedback. Dialogs are simple browser-native prompts/confirms for this slice; richer modals can follow later.

## Risks / Trade-offs

- [Risk] Native prompts are not the final UX quality bar -> Mitigation: keep action plumbing isolated so custom modals can replace prompts later.
- [Risk] Raw-byte upload may be basic for large files -> Mitigation: keep this slice for ordinary files and leave multipart/resumable uploads to future transfer work.
- [Risk] Delete and overwrite are dangerous -> Mitigation: require confirmation in the frontend and enforce explicit overwrite flags in the backend.
- [Risk] Path handling bugs can escape configured roots -> Mitigation: centralize path resolution and test traversal attempts.
- [Risk] Filesystem permissions vary by OS -> Mitigation: return provider diagnostics and keep metadata fields nullable/unavailable where needed.

## Migration Plan

1. Extend storage models and provider trait with content and mutation methods.
2. Implement filesystem operations with path traversal and read-only guards.
3. Add HTTP routes and API models.
4. Extend frontend API client and browser state.
5. Add browser toolbar, selection, breadcrumbs, operation prompts, upload input, and preview panel.
6. Add tests and run backend, frontend, and OpenSpec validation.

## Open Questions

- Whether copy/move should support directories recursively in the next slice.
- Whether browser-native prompts should be replaced immediately with domain-specific modal components.
- Whether upload should preserve browser-supplied MIME type in provider-specific metadata.
