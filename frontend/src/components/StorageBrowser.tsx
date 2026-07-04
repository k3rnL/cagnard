import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { ReactNode } from "react";
import {
  ArrowUpDown,
  Braces,
  ChevronDown,
  ChevronRight,
  Copy,
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
  const canCopySelection = hasSelection && state.selectedEntries.every((entry) => entry.kind === "file");
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
            primary={{ icon: <FilePlus size={17} />, label: "New file", onClick: state.createFile, disabled: !canMutate }}
            items={[
              { icon: <FolderPlus size={16} />, label: "New folder", onClick: state.createFolder, disabled: !canMutate },
              { icon: <Upload size={16} />, label: "Upload", onClick: () => uploadInput.current?.click(), disabled: !canMutate }
            ]}
          />
          <ActionMenuGroup
            primary={{ icon: <Download size={17} />, label: "Download", onClick: state.downloadSelected, disabled: fileSelectionCount === 0 }}
            items={[
              { icon: <Copy size={16} />, label: "Copy", onClick: state.copySelected, disabled: !canCopySelection || !canMutate },
              { icon: <MoveRight size={16} />, label: "Move", onClick: state.moveSelected, disabled: !hasSelection || !canMutate }
            ]}
          />
          <ActionMenuGroup
            primary={{ icon: <Pencil size={17} />, label: "Rename", onClick: state.renameSelected, disabled: !singleSelection || !canMutate }}
            items={[{ icon: <Trash2 size={16} />, label: "Delete", onClick: state.deleteSelected, disabled: !hasSelection || !canMutate, danger: true }]}
          />
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
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.open) return;
      if (event.target instanceof Node && menuRef.current.contains(event.target)) return;
      menuRef.current.open = false;
    };

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && menuRef.current?.open) menuRef.current.open = false;
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div className="action-menu-group">
      <ActionButton {...primary} primary />
      <details className="action-menu" ref={menuRef}>
        <summary aria-label={`${primary.label} options`} title={`${primary.label} options`}>
          <ChevronDown size={15} />
        </summary>
        <div className="action-menu-content">
          {items.map((item) => (
            <MenuActionButton action={item} key={item.label} />
          ))}
        </div>
      </details>
    </div>
  );
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

function MenuActionButton({ action }: { action: ActionDefinition }) {
  const className = action.danger ? "menu-action danger" : "menu-action";

  return (
    <button
      className={className}
      disabled={action.disabled}
      type="button"
      onClick={(event) => {
        event.currentTarget.closest("details")?.removeAttribute("open");
        void action.onClick();
      }}
    >
      {action.icon}
      <span>{action.label}</span>
    </button>
  );
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
