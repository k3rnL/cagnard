## Why

Cagnard still uses native browser dialogs for many storage actions. Those dialogs are visually inconsistent with the app, limit validation and contextual help, and make destructive or multi-step operations harder to understand. Copy and move are also currently modeled as immediate target-path prompts, which does not fit a multi-provider browser where the user may need to select files in one storage root and then navigate elsewhere before choosing the destination.

The browser needs normalized in-app modal patterns for action confirmation and data entry, plus a pasteboard workflow for copy and move. The pasteboard should hold selected files or directories client-side across the current browser window context, show their origin clearly, and let the user paste or move them into the currently browsed destination, including destinations served by another provider.

## What Changes

- Replace native `alert`, `confirm`, and `prompt` usage in the storage browser with app-owned modal components.
- Add reusable modal primitives for confirmation, text input, conflict policy selection, operation errors, and progress where needed.
- Keep modals visually consistent with Cagnard's browser UI, keyboard accessible, focus-contained, dismissible according to operation risk, and responsive on small screens.
- Replace copy and move target-path prompts with a client-side pasteboard.
- Allow the user to add selected entries to the pasteboard as source references, then choose Paste or Move here at the destination.
- Expose the pasteboard as a dropdown or popover in the command area.
- Show each pasteboard entry with name, type, source provider/root/account/path, selected state, and whether it is currently eligible for paste or move into the active destination.
- Allow pasteboard entries to be cleared all at once, removed one by one, and selected for paste/move as a subset.
- Support paste into the current active directory from the same browser runtime session and synchronize with another same-origin tab/window when an active tab can share the pasteboard state.
- Do not persist pasteboard contents across a full browser restart or a fresh application session.
- Ensure cross-provider copy works by using source download/read and destination upload/write capabilities rather than assuming same-root provider copy.
- Ensure cross-provider move works as copy-then-delete only after destination success, and only when the source exposes delete capability.
- Support files and directories in pasteboard copy/move. Directory transfer must use recursive provider-neutral planning when the source can list children and the destination can create directories and write files.
- Keep same-provider or same-root optimized paths possible when they preserve semantics, but do not make the UI depend on provider-specific workflows.
- Add standard file-browser conflict handling for destination name collisions: ask on conflict, offer Replace, Skip, and Keep Both/auto-rename where supported, and allow applying the choice to the remaining batch.
- Add operation feedback for partial success, unsupported provider capabilities, failed reads/writes/deletes, and destination refresh.

## Capabilities

### New Capabilities

- `browser-action-modals`: Defines normalized modal behavior for browser actions, including confirmation, text input, validation, focus management, and error presentation.
- `browser-pasteboard`: Defines the client-side pasteboard model for source references, entry lifecycle, source context display, destination eligibility, and paste or move execution.

### Modified Capabilities

- `storage-browser`: Replaces native dialogs with app modals, changes copy/move actions to pasteboard actions, and exposes pasteboard controls in the browser command surface.
- `cross-provider-transfer`: Requires copy and move operations initiated from the pasteboard to work across providers through provider-neutral transfer semantics.
- `storage-plugin-system`: Clarifies the storage capabilities required by pasteboard paste and move operations, especially read/download, upload/write, overwrite/conflict handling, and delete.

## Impact

- Frontend UI: add modal components, replace native dialog calls, add pasteboard state and dropdown UI, and update command grouping.
- Frontend data/actions: model copy and move as pasteboard execution actions over staged source references, not immediate prompts; keep pasteboard state session-only and synchronize it across active same-origin tabs/windows where practical.
- Backend API/storage providers: verify cross-provider file and directory copy can be executed with existing download/list/upload/create-folder APIs or add a provider-neutral transfer endpoint if required by correctness.
- Capability checks: validate source and destination support before paste starts and report unsupported operations before reading data.
- Documentation/specs: distinguish copy-to-path, pasteboard copy, pasteboard move, same-root optimized copy, and cross-provider transfer.
