## Context

Cagnard has provider-neutral browsing and basic file operations, but several actions still rely on native browser prompts and confirms. Those calls are simple to implement, but they break the visual system, cannot show rich context, and do not give enough room for validation, operation details, or accessible focus behavior.

Copy and move also need a stronger interaction model. A target-path prompt works for a single provider root, but it is a poor fit for browsing multiple providers. Users should be able to select entries, stage them, navigate to another root or provider, then paste or move them into the current location. The staged selection must be browser-local rather than server-side state.

## Goals / Non-Goals

**Goals:**

- Replace native browser dialogs used by file actions with normalized Cagnard modal components.
- Keep modal behavior consistent, accessible, keyboard friendly, and responsive.
- Introduce a browser-local pasteboard for source references that can later be copied or moved.
- Let pasteboard contents survive in-app navigation and synchronize across active same-origin tabs/windows during the current browser session where possible.
- Ensure pasteboard contents do not persist across a full browser restart or fresh application session.
- Show source context for pasteboard entries so users understand where each file came from.
- Execute pasteboard copy and move through provider-neutral transfer semantics.
- Make cross-provider file and directory copy work through source list/read/download and destination create-folder/upload/write capabilities.
- Make cross-provider move safe by deleting the source only after destination success.

**Non-Goals:**

- Store pasteboard state on the server.
- Implement full long-running transfer orchestration, resumability, or background jobs in this pass.
- Build a complex file-picker modal for copy/move destinations.
- Add provider-specific copy/move UI flows.

## Decisions

### 1. Use one app-owned modal system

The frontend will introduce a reusable modal layer for browser actions. It should support:

- confirmation dialogs for destructive actions.
- input dialogs for create file, create folder, rename, and similar operations.
- error/details dialogs for operation failures that need more than a toast.
- conflict policy dialogs or compact inline choices when a paste target already exists.
- focus trapping, Escape handling, initial focus, and focus restoration.
- mobile-friendly sizing without pushing the file list below the fold.

Native `alert`, `confirm`, and `prompt` should be removed from storage browser actions.

Rationale: a single modal system keeps action feedback coherent, avoids system-dialog visual breaks, and gives enough structure for validation and provider context.

### 2. Keep copy and move out of destination modals

Copy and move should not ask for a target path through a modal. The Copy button should stage selected entries into the pasteboard as source references. The user chooses the operation later from the pasteboard:

- Paste: create destination entries and keep sources.
- Move here: create destination entries and remove sources only after successful destination writes.

The paste destination is always the active storage root and current path when the user chooses paste or move here.

Rationale: navigation is already the destination picker. Reusing the browser view avoids building a large tree selector and makes cross-provider copy feel natural.

### 3. Model the pasteboard as session-only browser-local state

The pasteboard will be client-side only and must not be persisted across browser restarts. It should be kept in memory, namespaced by app origin and current authenticated user identity when available. Same-origin tabs/windows should be synchronized with `BroadcastChannel` when available. A newly opened same-origin tab may request the current pasteboard from already open tabs; if no peer tab can answer, the pasteboard starts empty.

The pasteboard state should contain only safe references and display metadata:

- pasteboard item id.
- source tunnel, provider id/family, account/root id, root label, path, entry kind, name, and normalized metadata.
- added timestamp.
- selected/enabled state for batch paste.

It must not contain raw provider credentials, downloaded file bytes, session tokens, or backend secrets.

Rationale: in-memory browser state gives the requested active-window behavior without adding server-side session state or restart persistence. Stale items are still validated at paste time.

### 4. Validate pasteboard entries at paste time

Pasteboard entries may become stale because files can be deleted, renamed, or permissions can change after staging. Paste execution must validate each source and destination before transfer:

- source still exists.
- source supports read/download for copy or move.
- destination root supports upload/write.
- destination conflict policy is explicit when a target exists.
- move source supports delete if the move crosses roots/providers or cannot use provider-native move.

The UI should show per-item eligibility in the pasteboard dropdown and per-item results after execution.

Rationale: stale browser-local references are acceptable if paste validates before mutation.

### 5. Add a provider-neutral transfer API for paste execution

The pasteboard itself is frontend state, but paste execution should call a provider-neutral backend API rather than forcing the browser to download and re-upload file bytes. The request should include:

- operation: copy or move.
- source reference: tunnel, root id, path.
- destination reference: tunnel, root id, destination directory/path.
- conflict policy.
- requested item list.

The backend can choose:

- same-root provider `copy` or `move` when source and destination are the same root and semantics are preserved.
- provider-optimized copy when a provider supports it safely.
- fallback transfer by reading/downloading from the source and uploading to the destination.
- recursive directory transfer by listing source children, creating destination directories, and copying child files.
- move as copy then delete only after destination success.

The first implementation may use bounded buffered transfers with a configured size limit if streaming is not available yet. Oversized items should fail before transfer with a clear reason.

Directory transfer is in scope. If a provider cannot list a directory, create destination directories, or write all child files safely, Cagnard should fail the directory item before starting destructive move deletion and report the missing capability.

Rationale: backend-mediated transfer keeps credentials hidden, centralizes capability checks, and is the right place to enforce safe move semantics.

### 6. Keep same-root operations optimized but not special in the UI

The pasteboard UI should be identical whether the user pastes into the same directory tree, another root from the same provider, or a different provider. The backend may still choose existing same-root copy/move calls when possible.

Rationale: users should learn one workflow. Provider-specific optimizations should be invisible unless they affect capabilities or error messages.

### 7. Use standard file-browser conflict handling

Paste should not overwrite silently. Like common desktop file browsers, the first conflicting destination should ask the user how to handle conflicts. The conflict UI should offer:

- Replace when the destination supports overwrite.
- Skip.
- Keep Both by auto-renaming the incoming item with a predictable suffix where supported.
- Apply this choice to remaining conflicts in the batch.

The safest default is to ask on conflict. The default focused option should be non-destructive: Keep Both when supported, otherwise Skip or Cancel. Replace must require explicit user choice.

Rationale: this matches the standard behavior users expect from Finder, Windows Explorer, and similar file managers while avoiding silent overwrite.

### 8. Use the pasteboard dropdown as an action surface

The command bar should expose a pasteboard dropdown/popover that shows:

- total item count and selected item count.
- entries grouped or labeled by source root/provider when useful.
- each item name, type, and source label/path.
- remove item action.
- select/deselect item action.
- clear all action.
- paste/copy here and move here actions, depending on the selected items and destination capabilities.
- eligibility/errors for the active destination.

The dropdown should close on outside click and remain usable on small screens.

Rationale: pasteboard state is operational state, not a modal destination picker. A dropdown keeps it near the action buttons and visible while browsing.

### 9. Preserve action clarity

The existing grouped command bar should be adjusted so users can distinguish:

- open/download actions.
- create/upload actions.
- add selected entries to the pasteboard.
- pasteboard dropdown and paste actions.
- rename/delete actions.

Labels should remain visible for primary actions where possible. Dangerous actions should continue to use visual danger styling and confirmation.

Rationale: the current icon-plus-menu direction is good, but copy/move become easier to understand once they are named as staging actions.

## Risks / Trade-offs

- Browser-local pasteboard can become stale. Mitigation: validate at paste time and show per-item failures.
- Cross-tab synchronization can vary by browser. Mitigation: use BroadcastChannel as best effort and start empty when no active peer can provide state.
- Buffered fallback transfers can be memory-heavy. Mitigation: enforce a configured maximum and fail early until streaming is implemented.
- Move across providers can partially complete if delete fails after copy. Mitigation: report partial success explicitly and keep the destination copy.
- Recursive directory transfer can be expensive and partially fail. Mitigation: plan the tree, validate capabilities before deletion, and report per-item/per-directory results.
- Conflict policy can become noisy. Mitigation: choose one batch-level policy before transfer instead of asking per item.

## Migration Plan

1. Add modal primitives and replace native dialogs for create file, create folder, rename, delete, errors, and confirmations.
2. Add session-only pasteboard state, user namespace, cross-tab synchronization, and dropdown UI.
3. Change copy/move command actions to add selected entries to the pasteboard instead of opening target-path prompts.
4. Add paste execution from the pasteboard into the active root/path.
5. Add backend provider-neutral transfer support for same-root and cross-provider file copy.
6. Add recursive directory transfer planning and execution for providers that can list, create directories, read files, and write files.
7. Add safe move semantics by deleting the source only after copy success and only when delete is supported.
8. Add conflict policy handling and per-item result reporting.
9. Update docs and OpenSpec main specs after implementation.

Rollback is straightforward for the modal layer because browser actions can be redirected to the previous implementations. Pasteboard rollout can be feature-gated by keeping existing same-root copy/move endpoints available while the new transfer path stabilizes.

## Resolved Decisions

- Pasteboard contents do not persist across full browser restarts or fresh application sessions.
- Cross-provider pasteboard transfer must support files and directories through recursive provider-neutral planning where capabilities allow it.
- Conflict handling follows common file-browser behavior: ask on conflict and offer Replace, Skip, and Keep Both/auto-rename with an apply-to-all option for batches.
