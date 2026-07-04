import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, RefObject } from "react";
import type { ReactNode } from "react";
import {
  ArrowUpDown,
  Braces,
  ChevronDown,
  ChevronRight,
  Clipboard,
  ClipboardPaste,
  CopyPlus,
  Download,
  Eye,
  File,
  FileArchive,
  FileAudio,
  FileBox,
  FileCode,
  FileCog,
  FilePlus,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  Home,
  Info,
  ListTree,
  MoveRight,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";

import type { CagnardDataState, EntrySelectionMode, OpenedFileState } from "../api/useCagnardData";
import type { EntrySortField } from "../api/useCagnardData";
import type { EntryMetadata, StorageEntry } from "../api/types";
import { classifyEntry } from "../plugins/fileTypeCatalog";
import { openerSupportsRaw } from "../plugins/fileOpeners";

interface StorageBrowserProps {
  state: CagnardDataState;
}

export function StorageBrowser({ state }: StorageBrowserProps) {
  const uploadInput = useRef<HTMLInputElement>(null);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const selectedEntry = state.selectedEntry;
  const pageOpenedFile = state.openedFile?.placement === "page" ? state.openedFile : undefined;
  const inlineOpenedFile = state.openedFile?.placement === "inline" ? state.openedFile : undefined;
  const canMutate = Boolean(state.selectedRoot && !state.selectedRoot.readOnly);
  const selectedIdSet = new Set(state.selectedEntryIds);
  const hasSelection = state.selectionCount > 0;
  const singleSelection = state.selectionCount === 1;
  const fileSelectionCount = state.selectedEntries.filter((entry) => entry.kind === "file").length;
  const visibleSelectedCount = state.entries.filter((entry) => selectedIdSet.has(entry.id)).length;
  const allVisibleSelected = state.entries.length > 0 && visibleSelectedCount === state.entries.length;
  const partiallyVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
  const rootBreadcrumbLabel = state.selectedRoot?.label ?? "Root";

  useEffect(() => {
    setMetadataOpen(false);
  }, [pageOpenedFile?.entry.id, state.currentPath, state.selectedRoot?.id]);

  return (
    <main className="content">
      <header className="toolbar">
        <div>
          <h1>{state.selectedRoot?.label ?? "Storage"}</h1>
          <p>
            {state.selectedRoot
              ? `${state.selectedRoot.providerFamily} / ${state.selectedRoot.accountId}`
              : "No storage root selected"}
          </p>
        </div>
        <div className="toolbar-actions">
          <ActionMenuGroup
            primary={{ icon: <Eye size={17} />, label: "Open", onClick: () => void state.openSelected(), disabled: !singleSelection }}
            items={[{ icon: <RefreshCw size={16} />, label: "Refresh", onClick: state.refresh }]}
          />
          <ActionMenuGroup
            primary={{ icon: <FolderPlus size={17} />, label: "New folder", onClick: state.createFolder, disabled: !canMutate }}
            items={[
              { icon: <FilePlus size={16} />, label: "New file", onClick: state.createFile, disabled: !canMutate }
            ]}
          />
          <ActionMenuGroup
            primary={{ icon: <Download size={17} />, label: "Download", onClick: state.downloadSelected, disabled: fileSelectionCount === 0 }}
            items={[
              { icon: <Upload size={16} />, label: "Upload", onClick: () => uploadInput.current?.click(), disabled: !canMutate }
            ]}
          />
          <ActionMenuGroup
            primary={{ icon: <Pencil size={17} />, label: "Rename", onClick: state.renameSelected, disabled: !singleSelection || !canMutate }}
            items={[{ icon: <Trash2 size={16} />, label: "Delete", onClick: state.deleteSelected, disabled: !hasSelection || !canMutate, danger: true }]}
          />
          <PasteboardControl state={state} />
          <input
            ref={uploadInput}
            className="visually-hidden"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void state.uploadFile(file);
              event.target.value = "";
            }}
          />
        </div>
      </header>

      <section className="pathbar" aria-label="Current path">
        <span className="path-scope">{state.selectedRoot?.tunnel ?? "storage"}</span>
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          {state.breadcrumbs.map((crumb, index) => (
            <Fragment key={crumb.path || "root"}>
              {index > 0 ? <ChevronRight className="breadcrumb-separator" size={14} aria-hidden="true" /> : null}
              <button
                className={index === state.breadcrumbs.length - 1 ? "current" : undefined}
                type="button"
                onClick={() => state.navigateToPath(crumb.path)}
              >
                {index === 0 ? <Home size={14} aria-hidden="true" /> : null}
                <span>{index === 0 ? rootBreadcrumbLabel : crumb.label}</span>
              </button>
            </Fragment>
          ))}
        </nav>
      </section>

      {!pageOpenedFile ? (
        <BrowserControls
          state={state}
          metadataOpen={metadataOpen}
          onToggleMetadata={() => setMetadataOpen((open) => !open)}
        />
      ) : null}

      {state.error ? <div className="error-banner">{state.error}</div> : null}
      {state.operationMessage ? <div className="success-banner">{state.operationMessage}</div> : null}

      {pageOpenedFile ? (
        <FileOpenerSurface state={state} opened={pageOpenedFile} />
      ) : (
      <>
      {metadataOpen ? <button className="metadata-backdrop" type="button" aria-label="Close metadata" onClick={() => setMetadataOpen(false)} /> : null}
      <section className="browser-layout">
        <div className="table-surface">
          <div className="table-header">
            <label className="selection-cell" title="Select visible entries">
              <SelectAllCheckbox
                checked={allVisibleSelected}
                indeterminate={partiallyVisibleSelected}
                onChange={() => {
                  if (allVisibleSelected) state.clearSelection();
                  else state.selectAllEntries();
                }}
              />
            </label>
            <SortHeader field="name" label="Name" state={state} />
            <SortHeader field="kind" label="Kind" state={state} />
            <SortHeader field="fileCategory" label="Type" state={state} />
            <SortHeader field="size" label="Size" state={state} />
            <SortHeader field="modifiedTime" label="Modified" state={state} />
            <SortHeader field="mimeType" label="MIME" state={state} />
          </div>

          {state.loading ? <div className="empty-row">Loading</div> : null}

          {!state.loading && state.entries.length === 0 ? (
            <div className="empty-row">{state.totalEntryCount === 0 ? "No entries" : "No matches"}</div>
          ) : null}

          {state.entries.map((entry) => (
            <Fragment key={entry.id}>
            <div
              className={selectedIdSet.has(entry.id) ? "entry-row selected" : "entry-row"}
              onClick={(event) => state.selectEntry(entry, selectionMode(event))}
              onDoubleClick={() => void state.openEntry(entry)}
              onKeyDown={(event) => handleEntryKey(event, entry, state)}
              role="button"
              tabIndex={0}
            >
              <label className="selection-cell" onClick={(event) => event.stopPropagation()}>
                <input
                  aria-label={`Select ${entry.name}`}
                  checked={selectedIdSet.has(entry.id)}
                  onChange={() => state.selectEntry(entry, "toggle")}
                  type="checkbox"
                />
              </label>
              <span className="entry-name">
                <span className={entry.kind === "file" ? "entry-icon-slot can-inline-open" : "entry-icon-slot"}>
                  <span className="entry-kind-icon">
                    <EntryIcon entry={entry} size={16} />
                  </span>
                  {entry.kind === "file" ? (
                    <button
                      className="entry-inline-open"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void state.openInlineEntry(entry);
                      }}
                      title={`Quick view ${entry.name}`}
                      aria-label={`Quick view ${entry.name}`}
                      tabIndex={-1}
                    >
                      <Eye size={15} />
                    </button>
                  ) : null}
                </span>
                <span className="entry-label">{entry.name}</span>
              </span>
              <span>{entry.kind}</span>
              <FileTypeCell entry={entry} />
              <span>{formatSize(entry.metadata.size)}</span>
              <span>{formatDate(entry.metadata.modifiedTime)}</span>
              <span>{entry.metadata.mimeType ?? "Unavailable"}</span>
            </div>
            {inlineOpenedFile?.entry.id === entry.id ? (
              <div className="inline-opener-row">
                <FileOpenerSurface state={state} opened={inlineOpenedFile} inline />
              </div>
            ) : null}
            </Fragment>
          ))}
        </div>

        <aside className={metadataOpen ? "details-panel open" : "details-panel"}>
          <div className="details-panel-header">
            <h2>Metadata</h2>
            <button className="icon-button compact details-close" type="button" onClick={() => setMetadataOpen(false)} title="Close metadata">
              <X size={15} />
            </button>
          </div>
          <div className="details-panel-content">
          {state.selectionCount > 1 ? (
            <SelectionSummary entries={state.selectedEntries} />
          ) : selectedEntry ? (
            <MetadataView entry={selectedEntry} />
          ) : (
            <p className="muted">Select a file to inspect metadata.</p>
          )}
          </div>
        </aside>
      </section>
      </>
      )}
      <BrowserActionModal state={state} />
    </main>
  );
}

interface ActionDefinition {
  icon: ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
}

function ActionMenuGroup({ primary, items }: { primary: ActionDefinition; items: ActionDefinition[] }) {
  const menu = useHoverDropdown<HTMLDivElement>();

  return (
    <div className="action-menu-group" ref={menu.ref} onMouseEnter={menu.openOnHover} onMouseLeave={menu.closeOnLeave}>
      <ActionButton {...primary} primary />
      <div className="action-menu">
        <button
          aria-expanded={menu.open}
          aria-haspopup="menu"
          aria-label={`${primary.label} options`}
          className="action-menu-trigger"
          onClick={menu.togglePinned}
          title={`${primary.label} options`}
          type="button"
        >
          <ChevronDown size={15} />
        </button>
        {menu.open ? (
          <div className="action-menu-content" role="menu">
            {items.map((item) => (
              <MenuActionButton action={item} key={item.label} onClose={menu.close} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function useHoverDropdown<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const closeTimer = useRef<number>();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  const clearCloseTimer = () => {
    if (closeTimer.current === undefined) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  };

  const close = () => {
    clearCloseTimer();
    setOpen(false);
    setPinned(false);
  };

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!open) return;
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      close();
    };

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && open) close();
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      clearCloseTimer();
    };
  }, [open]);

  return {
    ref,
    open,
    close,
    openOnHover: () => {
      clearCloseTimer();
      setOpen(true);
    },
    closeOnLeave: () => {
      if (pinned) return;
      clearCloseTimer();
      closeTimer.current = window.setTimeout(() => {
        setOpen(false);
        closeTimer.current = undefined;
      }, 140);
    },
    togglePinned: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      clearCloseTimer();
      if (open && pinned) {
        close();
        return;
      }
      setOpen(true);
      setPinned(true);
    }
  };
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
  primary
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
}) {
  const className = ["action-button", primary ? "primary-action" : undefined, danger ? "danger" : undefined].filter(Boolean).join(" ");
  return (
    <button className={className} onClick={() => void onClick()} disabled={disabled} type="button" title={label}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MenuActionButton({ action, onClose }: { action: ActionDefinition; onClose?: () => void }) {
  const className = action.danger ? "menu-action danger" : "menu-action";

  return (
    <button
      className={className}
      disabled={action.disabled}
      role="menuitem"
      type="button"
      onClick={() => {
        onClose?.();
        void action.onClick();
      }}
    >
      {action.icon}
      <span>{action.label}</span>
    </button>
  );
}

function PasteboardControl({ state }: { state: CagnardDataState }) {
  const menu = useHoverDropdown<HTMLDivElement>();
  const hasItems = state.pasteboardItems.length > 0;
  const hasSelection = state.selectionCount > 0;
  const copyBlockedReason = pasteboardBlockedReason(state, "copy");
  const moveBlockedReason = pasteboardBlockedReason(state, "move");

  const copyHere = async () => {
    await state.pasteboardTransfer("copy");
  };

  const moveHere = async () => {
    await state.pasteboardTransfer("move");
  };

  return (
    <div className="action-menu-group pasteboard-menu-group" ref={menu.ref} onMouseEnter={menu.openOnHover} onMouseLeave={menu.closeOnLeave}>
      <ActionButton icon={<CopyPlus size={17} />} label="Copy" onClick={state.copySelected} disabled={!hasSelection} primary />
      <div className="action-menu pasteboard-menu">
        <button
          aria-expanded={menu.open}
          aria-haspopup="menu"
          aria-label="Pasteboard"
          className="action-menu-trigger pasteboard-trigger"
          onClick={menu.togglePinned}
          title="Pasteboard"
          type="button"
        >
          <Clipboard size={16} />
          <span>{state.pasteboardItems.length}</span>
        </button>
        {menu.open ? (
          <div className="pasteboard-panel" role="menu">
            <div className="pasteboard-heading">
              <strong>Pasteboard</strong>
              <span>{state.pasteboardSelectedCount} selected</span>
            </div>
            {!hasItems ? (
              <p className="pasteboard-empty">No staged entries</p>
            ) : (
              <div className="pasteboard-items">
                {state.pasteboardItems.map((item) => {
                  const itemCopyBlockedReason = pasteboardItemBlockReason(item, state, "copy");
                  return (
                    <div className={itemCopyBlockedReason ? "pasteboard-item blocked" : "pasteboard-item"} key={item.id}>
                      <label className="selection-cell pasteboard-selection-cell">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => state.togglePasteboardItem(item.id)}
                          aria-label={`Select ${item.entry.name}`}
                        />
                      </label>
                      <div className="pasteboard-item-main">
                        <strong>{item.entry.name}</strong>
                        <span>from {item.source.rootLabel}</span>
                        <span>{item.source.providerFamily} / {item.source.path || "/"}</span>
                        {itemCopyBlockedReason ? <span className="pasteboard-item-warning">{itemCopyBlockedReason}</span> : null}
                      </div>
                      <button className="icon-button compact" type="button" onClick={() => state.removePasteboardItem(item.id)} title="Remove">
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {copyBlockedReason ? <p className="pasteboard-warning">{copyBlockedReason}</p> : null}
            <div className="pasteboard-actions">
              <button className="primary-button subtle" type="button" onClick={state.clearPasteboard} disabled={!hasItems || state.pasteboardBusy}>
                Clear
              </button>
              <div className="pasteboard-transfer-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void copyHere()}
                  disabled={!hasItems || state.pasteboardSelectedCount === 0 || Boolean(copyBlockedReason) || state.pasteboardBusy}
                >
                  <ClipboardPaste size={15} />
                  {state.pasteboardBusy ? "Pasting" : "Paste"}
                </button>
                <button
                  className="primary-button subtle"
                  type="button"
                  onClick={() => void moveHere()}
                  disabled={!hasItems || state.pasteboardSelectedCount === 0 || Boolean(moveBlockedReason) || state.pasteboardBusy}
                >
                  <MoveRight size={16} />
                  Move here
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function pasteboardBlockedReason(state: CagnardDataState, intent: "copy" | "move"): string | undefined {
  const destinationReason = pasteboardDestinationBlockReason(state);
  if (destinationReason) return destinationReason;
  return state.pasteboardItems
    .filter((item) => item.selected)
    .map((item) => pasteboardItemBlockReason(item, state, intent))
    .find(Boolean);
}

function pasteboardDestinationBlockReason(state: CagnardDataState): string | undefined {
  if (!state.selectedRoot) return "Select a destination root.";
  if (state.selectedRoot.readOnly) return "The current destination is read-only.";
  return undefined;
}

function pasteboardItemBlockReason(
  item: CagnardDataState["pasteboardItems"][number],
  state: CagnardDataState,
  intent: "copy" | "move"
): string | undefined {
  const root = state.selectedRoot;
  if (!root) return "Select a destination root.";
  if (root.readOnly) return "The current destination is read-only.";
  if (intent === "move" && item.source.readOnly) return "The source storage root is read-only.";
  if (item.source.tunnel !== root.tunnel || item.source.rootId !== root.id) return undefined;

  const targetPath = joinBrowserPath(state.currentPath, item.entry.name);
  if (intent === "move" && targetPath === item.source.path) return "Source and destination are the same entry.";
  if (item.entry.kind === "directory" && targetPath !== item.source.path && isBrowserDescendantPath(targetPath, item.source.path)) {
    return "A folder cannot be pasted into itself.";
  }

  return undefined;
}

function joinBrowserPath(parent: string, name: string): string {
  const cleanParent = parent.replace(/^\/+|\/+$/g, "");
  const cleanName = name.replace(/^\/+/g, "");
  return cleanParent ? `${cleanParent}/${cleanName}` : cleanName;
}

function isBrowserDescendantPath(path: string, ancestor: string): boolean {
  const cleanPath = path.replace(/^\/+|\/+$/g, "");
  const cleanAncestor = ancestor.replace(/^\/+|\/+$/g, "");
  return cleanAncestor.length > 0 && cleanPath.startsWith(`${cleanAncestor}/`);
}

function BrowserActionModal({ state }: { state: CagnardDataState }) {
  const modal = state.modal;
  const [value, setValue] = useState("");
  const [validation, setValidation] = useState<string>();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!modal) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    setValue(modal.kind === "text" ? modal.defaultValue ?? "" : "");
    setValidation(undefined);
    window.setTimeout(() => {
      if (modal.kind === "text") inputRef.current?.focus();
      else primaryRef.current?.focus();
    }, 0);
    return () => {
      window.setTimeout(() => {
        if (previousFocus?.isConnected) previousFocus.focus();
      }, 0);
    };
  }, [modal?.id]);

  if (!modal) return null;

  const submitText = () => {
    if (modal.kind !== "text") return;
    const nextValidation = modal.validate?.(value);
    if (nextValidation) {
      setValidation(nextValidation);
      return;
    }
    state.submitModal(value.trim());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      state.cancelModal();
      return;
    }
    if (event.key === "Tab") trapFocus(event);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="browser-modal-title" onKeyDown={onKeyDown}>
        <div className="modal-heading">
          <h2 id="browser-modal-title">{modal.title}</h2>
          <button className="icon-button compact" type="button" onClick={state.cancelModal} title="Close">
            <X size={15} />
          </button>
        </div>

        {modal.kind === "text" ? (
          <form
            className="modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitText();
            }}
          >
            <label>
              <span>{modal.label}</span>
              <input
                ref={inputRef}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setValidation(undefined);
                }}
                placeholder={modal.placeholder}
              />
            </label>
            {validation ? <p className="modal-validation">{validation}</p> : null}
            <div className="modal-actions">
              <button className="primary-button subtle" type="button" onClick={state.cancelModal}>Cancel</button>
              <button className="primary-button" type="submit" ref={primaryRef}>{modal.confirmLabel}</button>
            </div>
          </form>
        ) : null}

        {modal.kind === "confirm" ? (
          <>
            <p className="modal-message">{modal.message}</p>
            <div className="modal-actions">
              <button className="primary-button subtle" type="button" onClick={state.cancelModal}>Cancel</button>
              <button className={modal.danger ? "primary-button danger" : "primary-button"} type="button" ref={primaryRef} onClick={() => state.submitModal(true)}>
                {modal.confirmLabel}
              </button>
            </div>
          </>
        ) : null}

        {modal.kind === "message" ? (
          <>
            <p className="modal-message">{modal.message}</p>
            <div className="modal-actions">
              <button className={modal.danger ? "primary-button danger" : "primary-button"} type="button" ref={primaryRef} onClick={() => state.submitModal(true)}>
                {modal.confirmLabel ?? "OK"}
              </button>
            </div>
          </>
        ) : null}

        {modal.kind === "conflict" ? (
          <>
            <p className="modal-message">{modal.message}</p>
            <ConflictActions modal={modal} state={state} primaryRef={primaryRef} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function ConflictActions({
  modal,
  state,
  primaryRef
}: {
  modal: Extract<NonNullable<CagnardDataState["modal"]>, { kind: "conflict" }>;
  state: CagnardDataState;
  primaryRef: RefObject<HTMLButtonElement>;
}) {
  const submit = (policy: "skip" | "keep-both" | "replace") => state.submitModal({ policy, applyToAll: true });

  return (
    <>
      <p className="modal-message">The selected choice applies to this paste batch.</p>
      <div className="modal-actions conflict-actions">
        <button className="primary-button subtle" type="button" onClick={state.cancelModal}>Cancel</button>
        <button className="primary-button subtle" type="button" onClick={() => submit("skip")}>Skip</button>
        {modal.canKeepBoth ? (
          <button className="primary-button" type="button" ref={primaryRef} onClick={() => submit("keep-both")}>Keep both</button>
        ) : null}
        {modal.canReplace ? (
          <button className="primary-button danger" type="button" onClick={() => submit("replace")}>Replace</button>
        ) : null}
      </div>
    </>
  );
}

function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")
  ).filter((element) => element.offsetParent !== null);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function BrowserControls({
  state,
  metadataOpen,
  onToggleMetadata
}: {
  state: CagnardDataState;
  metadataOpen: boolean;
  onToggleMetadata: () => void;
}) {
  return (
    <section className="browser-controls">
      <label className="search-field">
        <Search size={16} aria-hidden="true" />
        <input
          value={state.filterQuery}
          onChange={(event) => state.setFilterQuery(event.target.value)}
          placeholder="Search current folder"
          type="search"
        />
        {state.filterQuery ? (
          <button type="button" onClick={() => state.setFilterQuery("")} title="Clear search">
            <X size={14} />
          </button>
        ) : null}
      </label>
      <div className="selection-status">
        <button
          className={metadataOpen ? "metadata-toggle active" : "metadata-toggle"}
          type="button"
          onClick={onToggleMetadata}
          title="Metadata"
        >
          <Info size={15} />
          <span>Metadata</span>
        </button>
        <span>
          {state.selectionCount > 0
            ? `${state.selectionCount} selected`
            : `${state.entries.length} of ${state.totalEntryCount}`}
        </span>
        {state.selectionCount > 0 ? (
          <button className="icon-button compact" type="button" onClick={state.clearSelection} title="Clear selection">
            <X size={15} />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SortHeader({ field, label, state }: { field: EntrySortField; label: string; state: CagnardDataState }) {
  const active = state.sortField === field;
  const direction = state.sortDirection === "asc" ? "ascending" : "descending";

  return (
    <button
      className={active ? "sort-header active" : "sort-header"}
      type="button"
      onClick={() => state.setSort(field)}
      title={`Sort by ${label}`}
      aria-sort={active ? direction : "none"}
    >
      <span>{label}</span>
      <ArrowUpDown size={13} aria-hidden="true" />
    </button>
  );
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return <input ref={inputRef} aria-label="Select visible entries" checked={checked} onChange={onChange} type="checkbox" />;
}

function selectionMode(event: MouseEvent<HTMLElement>): EntrySelectionMode {
  if (event.shiftKey) return "range";
  if (event.metaKey || event.ctrlKey) return "toggle";
  return "replace";
}

function handleEntryKey(event: KeyboardEvent<HTMLElement>, entry: StorageEntry, state: CagnardDataState) {
  if (event.key === " ") {
    event.preventDefault();
    state.selectEntry(entry, "toggle");
  }

  if (event.key === "Enter") {
    event.preventDefault();
    void state.openEntry(entry);
  }
}

function MetadataView({ entry }: { entry: StorageEntry }) {
  const metadata = entry.metadata;
  const classification = classifyEntry(entry);

  return (
    <dl className="metadata-list">
      <MetadataRow label="Type" value={entry.kind === "directory" ? "Folder" : classification.label} />
      <MetadataRow label="Size" value={formatSize(metadata.size)} />
      <MetadataRow label="Modified" value={formatDate(metadata.modifiedTime)} />
      <MetadataRow label="MIME" value={metadata.mimeType} />
      <MetadataRow label="MIME source" value={metadata.mimeTypeSource} />
      <MetadataRow label="Owner" value={metadata.owner} />
      <MetadataRow label="Permissions" value={metadata.permissions} />
      <MetadataRow label="Version" value={metadata.version} metadata={metadata} field="version" />
      <MetadataRow label="Retention" value={metadata.retention} metadata={metadata} field="retention" />
      <MetadataRow label="Encryption" value={metadata.encryption} metadata={metadata} field="encryption" />
    </dl>
  );
}

function FileOpenerSurface({ state, opened, inline = false }: { state: CagnardDataState; opened: OpenedFileState; inline?: boolean }) {
  const entry = opened.entry;
  const match = opened.match;
  const classification = match?.classification ?? classifyEntry(entry);
  const content = opened.editedContent ?? opened.content ?? "";
  const canEdit = match?.opener.mode === "editor" && match.opener.editMode !== "none";
  const canSave = Boolean(match && match.opener.saveStrategy === "overwrite" && opened.dirty && !opened.loading && state.selectedRoot && !state.selectedRoot.readOnly);
  const hasSource = Boolean(match && openerSupportsRaw(match.opener) && opened.content !== undefined);

  return (
    <section className={inline ? "file-opener inline-file-opener" : "file-opener page-file-opener"}>
      <header className="file-opener-header">
        <div className="file-opener-title">
          <EntryIcon entry={entry} size={20} />
          <div>
            <h2>{entry.name}</h2>
            <p>{match ? `${match.opener.label} / ${match.reason}` : classification.label}</p>
          </div>
        </div>
        <div className="file-opener-actions">
          {match?.opener.view === "json" ? (
            <>
              <button className="icon-button" type="button" onClick={state.prettifyOpenedJson} title="Prettify JSON">
                <ListTree size={17} />
              </button>
              <button className="icon-button" type="button" onClick={state.minifyOpenedJson} title="Minify JSON">
                <Braces size={17} />
              </button>
            </>
          ) : null}
          <button className="icon-button" type="button" onClick={() => void state.saveOpenedFile()} disabled={!canSave} title="Save">
            <Save size={17} />
          </button>
          <button className="icon-button" type="button" onClick={state.closeOpenedFile} title="Close">
            <X size={17} />
          </button>
        </div>
      </header>

      {match && viewTabs(match.opener.view, hasSource).length > 1 ? (
        <div className="opener-tabs">
          {viewTabs(match.opener.view, hasSource).map((tab) => (
            <button
              className={opened.viewMode === tab.value ? "active" : undefined}
              key={tab.value}
              type="button"
              onClick={() => state.setOpenedFileViewMode(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {opened.error ? <div className="error-banner">{opened.error}</div> : null}
      {opened.loading ? <div className="empty-row">Opening file</div> : null}

      {!opened.loading ? (
        <div className="file-opener-body">
          {!match ? <UnsupportedFile entry={entry} classification={classification} /> : null}
          {match?.opener.view === "archive" ? <ArchiveMetadata entry={entry} classification={classification} /> : null}
          {match?.opener.view === "media" && opened.blobUrl ? <MediaViewer entry={entry} classification={classification} url={opened.blobUrl} /> : null}
          {match?.opener.view === "pdf" && opened.blobUrl ? <iframe className="pdf-viewer" src={opened.blobUrl} title={entry.name} /> : null}
          {match?.opener.view === "markdown" && opened.viewMode === "rendered" ? <MarkdownView content={content} /> : null}
          {match?.opener.view === "json" && opened.viewMode === "tree" ? <JsonView content={content} /> : null}
          {match?.opener.view === "csv" && opened.viewMode === "table" ? <CsvTable content={content} /> : null}
          {match && shouldShowSource(opened.viewMode) ? (
            canEdit ? (
              <textarea className="source-editor" value={content} onChange={(event) => state.updateOpenedFileContent(event.target.value)} spellCheck={false} />
            ) : (
              <pre className="source-view">{content}</pre>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function UnsupportedFile({ entry, classification }: { entry: StorageEntry; classification: ReturnType<typeof classifyEntry> }) {
  return (
    <div className="unsupported-file">
      <EntryIcon entry={entry} size={28} />
      <div>
        <strong>{classification.label}</strong>
        <p className="muted">No compatible in-app opener is available. Metadata and storage actions remain available.</p>
      </div>
    </div>
  );
}

function ArchiveMetadata({ entry, classification }: { entry: StorageEntry; classification: ReturnType<typeof classifyEntry> }) {
  return (
    <dl className="metadata-list opener-metadata">
      <MetadataRow label="Type" value={classification.label} />
      <MetadataRow label="Size" value={formatSize(entry.metadata.size)} />
      <MetadataRow label="MIME" value={entry.metadata.mimeType} />
      <MetadataRow label="Path" value={entry.path} />
    </dl>
  );
}

function MediaViewer({ entry, classification, url }: { entry: StorageEntry; classification: ReturnType<typeof classifyEntry>; url: string }) {
  if (classification.category === "image") return <img className="media-viewer" src={url} alt={entry.name} />;
  if (classification.category === "audio") return <audio className="media-player" src={url} controls />;
  if (classification.category === "video") return <video className="media-player" src={url} controls />;
  return null;
}

function MarkdownView({ content }: { content: string }) {
  return <div className="markdown-view">{renderMarkdown(content)}</div>;
}

function JsonView({ content }: { content: string }) {
  try {
    return <JsonNode value={JSON.parse(content)} />;
  } catch (caught) {
    return <pre className="source-view">Invalid JSON: {caught instanceof Error ? caught.message : String(caught)}</pre>;
  }
}

function JsonNode({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <details className="json-node" open>
        <summary>Array [{value.length}]</summary>
        {value.map((item, index) => (
          <div className="json-child" key={index}>
            <span className="json-key">{index}</span>
            <JsonNode value={item} />
          </div>
        ))}
      </details>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <details className="json-node" open>
        <summary>Object {"{"}{entries.length}{"}"}</summary>
        {entries.map(([key, item]) => (
          <div className="json-child" key={key}>
            <span className="json-key">{key}</span>
            <JsonNode value={item} />
          </div>
        ))}
      </details>
    );
  }

  return <code className="json-scalar">{JSON.stringify(value)}</code>;
}

function CsvTable({ content }: { content: string }) {
  const rows = useMemo(() => parseDelimited(content), [content]);
  if (rows.length === 0) return <p className="muted">No rows.</p>;
  const [header, ...body] = rows;
  const displayedRows = body.slice(0, 200);

  return (
    <div className="csv-table-wrap">
      <table className="csv-table">
        <thead>
          <tr>{header.map((cell, index) => <th key={index}>{cell || `Column ${index + 1}`}</th>)}</tr>
        </thead>
        <tbody>
          {displayedRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {header.map((_, cellIndex) => <td key={cellIndex}>{row[cellIndex] ?? ""}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {body.length > displayedRows.length ? <p className="muted">Showing first {displayedRows.length} rows.</p> : null}
    </div>
  );
}

function FileTypeCell({ entry }: { entry: StorageEntry }) {
  const classification = classifyEntry(entry);
  return <span>{entry.kind === "directory" ? "Folder" : classification.label}</span>;
}

function EntryIcon({ entry, size }: { entry: StorageEntry; size: number }) {
  if (entry.kind === "directory") return <Folder size={size} />;
  const icon = classifyEntry(entry).icon;
  switch (icon) {
    case "file-archive":
      return <FileArchive size={size} />;
    case "file-audio":
      return <FileAudio size={size} />;
    case "file-box":
      return <FileBox size={size} />;
    case "file-code":
      return <FileCode size={size} />;
    case "file-cog":
      return <FileCog size={size} />;
    case "file-image":
      return <FileImage size={size} />;
    case "file-json":
      return <FileJson size={size} />;
    case "file-spreadsheet":
      return <FileSpreadsheet size={size} />;
    case "file-video":
      return <FileVideo size={size} />;
    case "file":
      return <File size={size} />;
    default:
      return <FileText size={size} />;
  }
}

function viewTabs(view: string, hasSource: boolean): Array<{ label: string; value: "archive" | "media" | "pdf" | "rendered" | "source" | "table" | "tree" }> {
  switch (view) {
    case "archive":
      return [{ label: "Metadata", value: "archive" }];
    case "csv":
      return [{ label: "Table", value: "table" }, ...(hasSource ? [{ label: "Raw", value: "source" as const }] : [])];
    case "json":
      return [{ label: "Tree", value: "tree" }, ...(hasSource ? [{ label: "Source", value: "source" as const }] : [])];
    case "markdown":
      return [{ label: "Rendered", value: "rendered" }, ...(hasSource ? [{ label: "Source", value: "source" as const }] : [])];
    case "media":
      return [{ label: "Viewer", value: "media" }];
    case "pdf":
      return [{ label: "PDF", value: "pdf" }];
    default:
      return [{ label: "Source", value: "source" }];
  }
}

function shouldShowSource(viewMode: string): boolean {
  return viewMode === "source";
}

function renderMarkdown(content: string) {
  const lines = content.split(/\r?\n/);
  const blocks: JSX.Element[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems;
    listItems = [];
    blocks.push(
      <ul key={`list-${blocks.length}`}>
        {items.map((item, index) => <li key={index}>{inlineMarkdown(item)}</li>)}
      </ul>
    );
  };

  lines.forEach((line, index) => {
    if (!line.trim()) {
      flushList();
      return;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const children = inlineMarkdown(heading[2]);
      if (level === 1) blocks.push(<h1 key={index}>{children}</h1>);
      else if (level === 2) blocks.push(<h2 key={index}>{children}</h2>);
      else if (level === 3) blocks.push(<h3 key={index}>{children}</h3>);
      else blocks.push(<h4 key={index}>{children}</h4>);
      return;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      return;
    }

    flushList();
    blocks.push(<p key={index}>{inlineMarkdown(line)}</p>);
  });

  flushList();
  return blocks;
}

function inlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function parseDelimited(content: string): string[][] {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  return content
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .slice(0, 1000)
    .map((line) => parseDelimitedLine(line, delimiter));
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function SelectionSummary({ entries }: { entries: StorageEntry[] }) {
  const fileCount = entries.filter((entry) => entry.kind === "file").length;
  const directoryCount = entries.filter((entry) => entry.kind === "directory").length;
  const knownSize = entries.reduce((total, entry) => total + (entry.metadata.size ?? 0), 0);

  return (
    <dl className="metadata-list">
      <MetadataRow label="Selected" value={`${entries.length}`} />
      <MetadataRow label="Files" value={`${fileCount}`} />
      <MetadataRow label="Folders" value={`${directoryCount}`} />
      <MetadataRow label="Known size" value={formatSize(knownSize)} />
    </dl>
  );
}

function MetadataRow({
  label,
  value,
  metadata,
  field
}: {
  label: string;
  value?: string | null;
  metadata?: EntryMetadata;
  field?: string;
}) {
  const unavailable = field ? metadata?.unavailable.includes(field) : false;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value ?? (unavailable ? "Unavailable" : "-")}</dd>
    </>
  );
}

function formatSize(size?: number | null): string {
  if (size === undefined || size === null) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
