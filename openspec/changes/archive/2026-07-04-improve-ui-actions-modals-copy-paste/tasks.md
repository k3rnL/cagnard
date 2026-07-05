## 1. App Modal System

- [x] 1.1 Add reusable frontend modal primitives for dialog shell, backdrop, title/description/actions, responsive layout, and danger styling.
- [x] 1.2 Add accessible modal behavior: focus trap, initial focus, Escape handling, outside-click policy, focus restoration, and ARIA wiring.
- [x] 1.3 Add typed modal helpers for text input, confirmation, error/details, and conflict policy selection.
- [x] 1.4 Replace all storage-browser `window.prompt`, `window.confirm`, and `window.alert` usage with app-owned modals.
- [x] 1.5 Add inline modal validation for create file, create folder, rename, delete confirmation, and invalid/unsafe names.

## 2. Browser Pasteboard Frontend

- [x] 2.1 Define pasteboard item, intent, source reference, destination eligibility, conflict policy, and item result frontend types.
- [x] 2.2 Implement session-only pasteboard state that survives in-app navigation but does not persist across full browser restart.
- [x] 2.3 Synchronize pasteboard updates across active same-origin tabs/windows with `BroadcastChannel` and clear/isolate state on logout or user change.
- [x] 2.4 Change copy and move commands to add selected entries to the pasteboard instead of asking for a destination path.
- [x] 2.5 Add pasteboard dropdown UI with item count, selected count, origin provider/root/path, intent, type, remove item, clear all, select/deselect, and close-on-outside-click behavior.
- [x] 2.6 Add paste/copy-here and move-here actions from the pasteboard dropdown using the active root and current path as destination.
- [x] 2.7 Show destination eligibility and per-item blocking reasons before paste execution.

## 3. Provider-Neutral Transfer Backend

- [x] 3.1 Add API models for pasteboard transfer requests and responses: operation, sources, destination, conflict policy, apply-to-all behavior, and per-item results.
- [x] 3.2 Add a backend route and service method for provider-neutral transfer execution with normal identity/root authorization.
- [x] 3.3 Validate source existence, source read/list capability, destination write/create-folder capability, overwrite capability, and move delete capability before mutation.
- [x] 3.4 Reuse optimized same-root provider copy/move operations when source and destination share a root and semantics are preserved.
- [x] 3.5 Implement cross-root/provider file copy through backend-mediated download/read and upload/write with a configured buffered-transfer size limit.
- [x] 3.6 Implement recursive directory transfer planning through source listing, destination directory creation, and child file transfer.
- [x] 3.7 Implement move as copy-then-delete only after destination success; report partial success if source deletion fails.
- [x] 3.8 Return per-item and per-child results for batch and recursive transfers without exposing provider secrets.

## 4. Conflict Handling

- [x] 4.1 Detect destination conflicts before writing each target path.
- [x] 4.2 Add standard file-browser conflict choices: Replace, Skip, and Keep Both/auto-rename where supported.
- [x] 4.3 Default conflict modal focus to a non-destructive choice and require explicit Replace before overwrite.
- [x] 4.4 Support applying a selected conflict policy to the remaining conflicts in the same batch.
- [x] 4.5 Generate predictable non-conflicting names for Keep Both across files and directories.

## 5. Storage Provider Capability Support

- [x] 5.1 Extend capability/limit reporting for pasteboard transfer, recursive listing, directory creation, buffered transfer limits, and recursive transfer limitations.
- [x] 5.2 Ensure the Unix filesystem provider supports recursive directory copy/move through the provider-neutral transfer path.
- [x] 5.3 Ensure the S3-compatible provider supports recursive prefix copy/move where its list, upload, copy/delete, and directory marker behavior allow it.
- [x] 5.4 Block or degrade recursive transfer before mutation when a provider cannot list directories, create destination directories, or represent required directory semantics.

## 6. Browser UI Integration

- [x] 6.1 Adjust the command bar so copy/move staging, pasteboard, open/download, create/upload, rename, and delete remain visually clear.
- [x] 6.2 Keep primary actions clickable and move secondary pasteboard actions into grouped controls without toolbar wrapping regressions.
- [x] 6.3 Refresh the active destination listing after successful paste operations and preserve enough pasteboard state for retries after partial failures.
- [x] 6.4 Surface transfer progress or pending state during paste execution and prevent duplicate paste submission.
- [x] 6.5 Verify modal and pasteboard behavior on desktop and constrained/mobile viewports.

## 7. Documentation And Specs

- [x] 7.1 Add feature documentation for normalized browser modals, pasteboard usage, session-only behavior, conflict handling, and cross-provider copy/move.
- [x] 7.2 Update storage browser, transfer, and storage plugin documentation with pasteboard-driven copy/move behavior.
- [x] 7.3 Sync the new `browser-action-modals` and `browser-pasteboard` specs into main specs after implementation.
- [x] 7.4 Sync modified `storage-browser`, `cross-provider-transfer`, and `storage-plugin-system` specs into main specs after implementation.

## 8. Verification

- [x] 8.1 Add backend tests for same-root transfer, cross-provider file transfer, recursive directory transfer, move delete-after-copy, conflict policies, and buffered transfer limits.
- [ ] 8.2 Add frontend coverage or focused manual verification for modal replacement, pasteboard staging, dropdown management, cross-tab sync, and conflict modal behavior. Partial: browser smoke covered modal replacement, pasteboard staging/dropdown, outside-click closing, and constrained viewport; cross-tab sync and visual conflict modal were not separately exercised.
- [x] 8.3 Run backend test suite.
- [x] 8.4 Run frontend typecheck and production build.
- [ ] 8.5 Run OpenSpec validation for `improve-ui-actions-modals-copy-paste` when the OpenSpec CLI is available. Not run: `openspec` is not installed in PATH in this workspace.
