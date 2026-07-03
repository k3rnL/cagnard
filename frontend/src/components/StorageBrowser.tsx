import { Fragment, useEffect, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import {
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Folder,
  FolderPlus,
  Home,
  MoveRight,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";

import type { CagnardDataState, EntrySelectionMode } from "../api/useCagnardData";
import type { EntrySortField } from "../api/useCagnardData";
import type { CapabilityStatus, EntryMetadata, StorageEntry } from "../api/types";
import { findPreviewPlugin } from "../plugins/previewRegistry";

interface StorageBrowserProps {
  state: CagnardDataState;
}

export function StorageBrowser({ state }: StorageBrowserProps) {
  const uploadInput = useRef<HTMLInputElement>(null);
  const selectedEntry = state.selectedEntry;
  const preview = selectedEntry ? findPreviewPlugin(selectedEntry, state.uiPlugins) : undefined;
  const canMutate = Boolean(state.selectedRoot && !state.selectedRoot.readOnly);
  const selectedIdSet = new Set(state.selectedEntryIds);
  const hasSelection = state.selectionCount > 0;
  const singleSelection = state.selectionCount === 1;
  const fileSelectionCount = state.selectedEntries.filter((entry) => entry.kind === "file").length;
  const canCopySelection = hasSelection && state.selectedEntries.every((entry) => entry.kind === "file");
  const visibleSelectedCount = state.entries.filter((entry) => selectedIdSet.has(entry.id)).length;
  const allVisibleSelected = state.entries.length > 0 && visibleSelectedCount === state.entries.length;
  const partiallyVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

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
          <button className="icon-button" onClick={state.createFolder} disabled={!canMutate} type="button" title="New folder">
            <FolderPlus size={18} />
          </button>
          <button className="icon-button" onClick={() => uploadInput.current?.click()} disabled={!canMutate} type="button" title="Upload">
            <Upload size={18} />
          </button>
          <button className="icon-button" onClick={state.downloadSelected} disabled={fileSelectionCount === 0} type="button" title="Download">
            <Download size={18} />
          </button>
          <button className="icon-button" onClick={state.renameSelected} disabled={!singleSelection || !canMutate} type="button" title="Rename">
            <Pencil size={18} />
          </button>
          <button className="icon-button" onClick={state.copySelected} disabled={!canCopySelection || !canMutate} type="button" title="Copy">
            <Copy size={18} />
          </button>
          <button className="icon-button" onClick={state.moveSelected} disabled={!hasSelection || !canMutate} type="button" title="Move">
            <MoveRight size={18} />
          </button>
          <button className="icon-button danger" onClick={state.deleteSelected} disabled={!hasSelection || !canMutate} type="button" title="Delete">
            <Trash2 size={18} />
          </button>
          <button className="icon-button" onClick={state.goUp} type="button" title="Up">
            <ArrowUp size={18} />
          </button>
          <button className="icon-button" onClick={state.refresh} type="button" title="Refresh">
            <RefreshCw size={18} />
          </button>
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
                <span>{index === 0 ? "Root" : crumb.label}</span>
              </button>
            </Fragment>
          ))}
        </nav>
      </section>

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

      {state.error ? <div className="error-banner">{state.error}</div> : null}
      {state.operationMessage ? <div className="success-banner">{state.operationMessage}</div> : null}

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
            <SortHeader field="kind" label="Type" state={state} />
            <SortHeader field="size" label="Size" state={state} />
            <SortHeader field="modifiedTime" label="Modified" state={state} />
            <SortHeader field="mimeType" label="MIME" state={state} />
            <span>Capabilities</span>
          </div>

          {state.loading ? <div className="empty-row">Loading</div> : null}

          {!state.loading && state.entries.length === 0 ? (
            <div className="empty-row">{state.totalEntryCount === 0 ? "No entries" : "No matches"}</div>
          ) : null}

          {state.entries.map((entry) => (
            <div
              className={selectedIdSet.has(entry.id) ? "entry-row selected" : "entry-row"}
              key={entry.id}
              onClick={(event) => state.selectEntry(entry, selectionMode(event))}
              onDoubleClick={() => state.openDirectory(entry)}
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
                {entry.kind === "directory" ? <Folder size={16} /> : <FileText size={16} />}
                {entry.name}
              </span>
              <span>{entry.kind}</span>
              <span>{formatSize(entry.metadata.size)}</span>
              <span>{formatDate(entry.metadata.modifiedTime)}</span>
              <span>{entry.metadata.mimeType ?? "Unavailable"}</span>
              <span className="capability-list">{supportedCapabilities(entry.capabilities)}</span>
            </div>
          ))}
        </div>

        <aside className="details-panel">
          <h2>Metadata</h2>
          {state.selectionCount > 1 ? (
            <SelectionSummary entries={state.selectedEntries} />
          ) : selectedEntry ? (
            <MetadataView entry={selectedEntry} />
          ) : (
            <p className="muted">Select a file to inspect metadata.</p>
          )}

          <h2>Preview</h2>
          {state.selectionCount > 1 ? (
            <p className="muted">{state.selectionCount} entries selected.</p>
          ) : selectedEntry && preview && state.previewContent ? (
            <div className="preview-plugin text-preview">
              <div className="preview-heading">
                <strong>{preview.plugin.label}</strong>
                <span>{preview.reason}</span>
              </div>
              <pre>{state.previewContent}</pre>
            </div>
          ) : state.previewLoading ? (
            <p className="muted">Loading preview</p>
          ) : (
            <p className="muted">No preview plugin selected.</p>
          )}
        </aside>
      </section>
    </main>
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
    if (entry.kind === "directory") state.openDirectory(entry);
    else state.selectEntry(entry);
  }
}

function MetadataView({ entry }: { entry: StorageEntry }) {
  const metadata = entry.metadata;

  return (
    <dl className="metadata-list">
      <MetadataRow label="Size" value={formatSize(metadata.size)} />
      <MetadataRow label="Modified" value={formatDate(metadata.modifiedTime)} />
      <MetadataRow label="MIME" value={metadata.mimeType} />
      <MetadataRow label="Owner" value={metadata.owner} />
      <MetadataRow label="Permissions" value={metadata.permissions} />
      <MetadataRow label="Version" value={metadata.version} metadata={metadata} field="version" />
      <MetadataRow label="Retention" value={metadata.retention} metadata={metadata} field="retention" />
      <MetadataRow label="Encryption" value={metadata.encryption} metadata={metadata} field="encryption" />
    </dl>
  );
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

function supportedCapabilities(capabilities: CapabilityStatus[]): string {
  const supported = capabilities.filter((capability) => capability.status === "supported").map((capability) => capability.name);
  return supported.slice(0, 4).join(", ") || "-";
}
