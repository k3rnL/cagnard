import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, RefObject } from "react";
import type { ReactNode } from "react";
import {
  ArrowUpDown,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
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
  LoaderCircle,
  MoveRight,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
  XCircle
} from "lucide-react";

import hljs from "highlight.js/lib/common";
import scala from "highlight.js/lib/languages/scala";
import properties from "highlight.js/lib/languages/properties";
import "highlight.js/styles/github.css";
import YAML from "yaml";

hljs.registerLanguage("scala", scala);
hljs.registerLanguage("properties", properties);

import type { BrowserUploadItem, CagnardDataState, EntrySelectionMode, OpenedFileState, OpenedFileViewMode } from "../api/useCagnardData";
import type { EntrySortField } from "../api/useCagnardData";
import { taskOperationLabel } from "../api/useCagnardData";
import { currentDirectoryDownloadUnavailableReason } from "../api/browserActions";
import { useFileWatch } from "../api/useFileWatch";
import type { ArchiveEntry, EntryMetadata, StorageEntry, TaskResponse, TaskItem } from "../api/types";
import { cagnardApi } from "../api/client";
import { classifyEntry, highlightLanguageOf } from "../openers/fileTypeCatalog";
import { loadFirstPartyOpenerRuntime, openerSupportsRaw, resolveFileOpener } from "../openers/fileOpeners";
import type { StructuredFormatId } from "../formats/models";

const StructuredDataView = lazy(
  () => loadFirstPartyOpenerRuntime("parquet") as Promise<typeof import("../formats/StructuredDataView")>
);

interface StorageBrowserProps {
  state: CagnardDataState;
}

type ToastKind = "error" | "success";

interface ToastMessage {
  id: number;
  kind: ToastKind;
  title: string;
  message: string;
}

export function StorageBrowser({ state }: StorageBrowserProps) {
  const uploadFilesInput = useRef<HTMLInputElement>(null);
  const uploadDirectoryInput = useRef<HTMLInputElement>(null);
  const uploadDragDepth = useRef(0);
  const toastSequence = useRef(0);
  const toastTimers = useRef<number[]>([]);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [uploadDragActive, setUploadDragActive] = useState(false);
  const selectedEntry = state.selectedEntry;
  const pageOpenedFile = state.openedFile?.placement === "page" ? state.openedFile : undefined;
  const inlineOpenedFile = state.openedFile?.placement === "inline" ? state.openedFile : undefined;
  const canMutate = Boolean(state.selectedRoot && !state.selectedRoot.readOnly);
  const selectedIdSet = new Set(state.selectedEntryIds);
  const hasSelection = state.selectionCount > 0;
  const singleSelection = state.selectionCount === 1;
  const visibleSelectedCount = state.entries.filter((entry) => selectedIdSet.has(entry.id)).length;
  const allVisibleSelected = state.entries.length > 0 && visibleSelectedCount === state.entries.length;
  const partiallyVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
  const rootBreadcrumbLabel = state.selectedRoot?.label ?? "Root";
  const currentDirectoryDownloadReason =
    currentDirectoryDownloadUnavailableReason(state.selectedRoot);
  const readablePath = useMemo(
    () => readableStoragePath(rootBreadcrumbLabel, state.breadcrumbs.slice(1).map((crumb) => crumb.label).join("/")),
    [rootBreadcrumbLabel, state.breadcrumbs]
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((kind: ToastKind, title: string, message: string) => {
    const id = toastSequence.current + 1;
    toastSequence.current = id;
    setToasts((current) => [...current.slice(-3), { id, kind, title, message }]);

    const timeout = window.setTimeout(() => {
      dismissToast(id);
    }, kind === "error" ? 7000 : 4200);
    toastTimers.current.push(timeout);
  }, [dismissToast]);

  useEffect(() => {
    setMetadataOpen(false);
  }, [pageOpenedFile?.entry.id, state.currentPath, state.selectedRoot?.id]);

  useEffect(() => {
    return () => {
      toastTimers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (state.error) showToast("error", "Action failed", state.error);
  }, [showToast, state.error]);

  useEffect(() => {
    if (state.operationMessage) showToast("success", "Done", state.operationMessage);
  }, [showToast, state.operationMessage]);

  const copyCurrentPath = useCallback(async () => {
    try {
      await copyTextToClipboard(readablePath);
      showToast("success", "Path copied", readablePath);
    } catch (caught) {
      showToast("error", "Clipboard unavailable", caught instanceof Error ? caught.message : String(caught));
    }
  }, [readablePath, showToast]);

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
          <button
            aria-label={pageOpenedFile ? "Reload opened file" : "Refresh current folder"}
            className="icon-button toolbar-refresh"
            onClick={() => void state.refresh()}
            title={pageOpenedFile ? "Reload opened file" : "Refresh current folder"}
            type="button"
          >
            <RefreshCw size={18} />
          </button>
          <ActionMenuGroup
            primary={{ icon: <FolderPlus size={17} />, label: "New folder", onClick: state.createFolder, disabled: !canMutate }}
            items={[
              { icon: <FilePlus size={16} />, label: "New file", onClick: state.createFile, disabled: !canMutate }
            ]}
          />
          {state.downloadTarget.kind === "current-directory" ? (
            <ActionMenuGroup
              className="transfer-action-group"
              primary={{ icon: <Upload size={17} />, label: "Upload files", onClick: () => uploadFilesInput.current?.click(), disabled: !canMutate }}
              items={[
                { icon: <FolderPlus size={16} />, label: "Upload folder", onClick: () => uploadDirectoryInput.current?.click(), disabled: !canMutate },
                {
                  icon: <Download size={16} />,
                  label: "Download current folder",
                  onClick: state.download,
                  disabled: Boolean(currentDirectoryDownloadReason),
                  disabledReason: currentDirectoryDownloadReason,
                },
              ]}
            />
          ) : (
            <ActionMenuGroup
              className="transfer-action-group"
              primary={{ icon: <Download size={17} />, label: "Download", onClick: state.download, disabled: !state.selectedRoot }}
              items={[
                { icon: <Upload size={16} />, label: "Upload files", onClick: () => uploadFilesInput.current?.click(), disabled: !canMutate },
                { icon: <FolderPlus size={16} />, label: "Upload folder", onClick: () => uploadDirectoryInput.current?.click(), disabled: !canMutate }
              ]}
            />
          )}
          <ActionMenuGroup
            primary={{ icon: <Pencil size={17} />, label: "Rename", onClick: state.renameSelected, disabled: !singleSelection || !canMutate }}
            items={[{ icon: <Trash2 size={16} />, label: "Delete", onClick: state.deleteSelected, disabled: !hasSelection || !canMutate, danger: true }]}
          />
          <PasteboardControl state={state} />
          <TaskQueueControl state={state} />
          <input
            ref={uploadFilesInput}
            aria-label="Upload files"
            className="visually-hidden"
            multiple
            tabIndex={-1}
            type="file"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) void state.uploadItems(files.map((file) => ({ relativePath: file.name, kind: "file", file })));
              event.target.value = "";
            }}
          />
          <input
            ref={uploadDirectoryInput}
            aria-label="Upload folder"
            className="visually-hidden"
            multiple
            tabIndex={-1}
            type="file"
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) void state.uploadItems(files.map((file) => ({ relativePath: file.webkitRelativePath || file.name, kind: "file", file })));
              event.target.value = "";
            }}
          />
        </div>
      </header>

      <section className="pathbar" aria-label="Current path">
        <span className="path-scope">{state.selectedRoot?.tunnel ?? "storage"}</span>
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          {state.breadcrumbs.map((crumb, index) => (
            <Fragment key={`${crumb.kind}:${crumb.path || "root"}:${index}`}>
              {index > 0 ? <ChevronRight className="breadcrumb-separator" size={14} aria-hidden="true" /> : null}
              <button
                className={index === state.breadcrumbs.length - 1 ? "current" : undefined}
                disabled={!crumb.navigable}
                type="button"
                onClick={() => {
                  if (crumb.navigable) state.navigateToPath(crumb.path);
                }}
                aria-current={index === state.breadcrumbs.length - 1 ? "page" : undefined}
              >
                {index === 0 ? <Home size={14} aria-hidden="true" /> : null}
                <span>{index === 0 ? rootBreadcrumbLabel : crumb.label}</span>
              </button>
            </Fragment>
          ))}
        </nav>
        <button className="copy-path-button" type="button" onClick={() => void copyCurrentPath()} title="Copy current path">
          <Clipboard size={14} />
          <span>Copy path</span>
        </button>
      </section>

      {!pageOpenedFile ? (
        <BrowserControls
          state={state}
          metadataOpen={metadataOpen}
          onToggleMetadata={() => setMetadataOpen((open) => !open)}
        />
      ) : null}

      {pageOpenedFile ? (
        <FileOpenerSurface
          key={`${pageOpenedFile.entry.id}:${pageOpenedFile.reloadToken ?? 0}`}
          state={state}
          opened={pageOpenedFile}
        />
      ) : (
      <>
      {metadataOpen ? <button className="metadata-backdrop" type="button" aria-label="Close metadata" onClick={() => setMetadataOpen(false)} /> : null}
      <section
        className={`browser-layout${uploadDragActive ? " upload-drag-active" : ""}`}
        onDragEnter={(event) => {
          if (!canMutate || !hasUploadPayload(event.dataTransfer)) return;
          event.preventDefault();
          uploadDragDepth.current += 1;
          setUploadDragActive(true);
        }}
        onDragOver={(event) => {
          if (!canMutate || !hasUploadPayload(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => {
          uploadDragDepth.current = Math.max(0, uploadDragDepth.current - 1);
          if (uploadDragDepth.current === 0) setUploadDragActive(false);
        }}
        onDrop={(event) => {
          if (!canMutate) return;
          event.preventDefault();
          uploadDragDepth.current = 0;
          setUploadDragActive(false);
          void collectDroppedUploadItems(event.dataTransfer).then((items) => state.uploadItems(items));
        }}
      >
        {uploadDragActive ? <div className="upload-drop-indicator" aria-hidden="true"><Upload size={22} /></div> : null}
        <div className={state.loading ? "table-surface pending" : "table-surface"} aria-busy={state.loading}>
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

          {state.loading ? (
            <div className="pending-overlay" aria-live="polite">
              <LoaderCircle className="pending-spinner" size={22} />
              <span className="visually-hidden">Loading entries</span>
            </div>
          ) : null}

          {!state.loading && state.entries.length === 0 ? (
            <div className="empty-row">{state.filterQuery.trim() ? "No matches" : "No entries"}</div>
          ) : null}

          {state.entries.map((entry) => (
            <Fragment key={entry.id}>
            <div
              className={selectedIdSet.has(entry.id) ? "entry-row selected" : "entry-row"}
              onClick={(event) => handleEntryClick(event, entry, state)}
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
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <article className={`toast ${toast.kind}`} key={toast.id} role={toast.kind === "error" ? "alert" : "status"}>
          <div>
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
          </div>
          <button className="icon-button compact" type="button" onClick={() => onDismiss(toast.id)} title="Dismiss notification">
            <X size={14} />
          </button>
        </article>
      ))}
    </div>
  );
}

function readableStoragePath(rootLabel: string, path: string): string {
  const parts = path.split("/").filter(Boolean);
  return [rootLabel, ...parts].join("/");
}

function hasUploadPayload(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes("Files");
}

async function collectDroppedUploadItems(dataTransfer: DataTransfer): Promise<BrowserUploadItem[]> {
  const entries = Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));
  if (entries.length === 0) {
    return Array.from(dataTransfer.files).map((file) => ({ relativePath: file.webkitRelativePath || file.name, kind: "file", file }));
  }

  const out: BrowserUploadItem[] = [];
  for (const entry of entries) await collectDroppedEntry(entry, "", out);
  const unique = new Map<string, BrowserUploadItem>();
  for (const item of out) unique.set(`${item.kind}:${item.relativePath}`, item);
  return [...unique.values()];
}

async function collectDroppedEntry(entry: FileSystemEntry, parent: string, out: BrowserUploadItem[]): Promise<void> {
  const relativePath = parent ? `${parent}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ relativePath, kind: "file", file });
    return;
  }
  if (!entry.isDirectory) return;
  out.push({ relativePath, kind: "directory" });
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (children.length === 0) break;
    for (const child of children) await collectDroppedEntry(child, relativePath, out);
  }
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) throw new Error("Browser refused clipboard access.");
  } finally {
    document.body.removeChild(textarea);
  }
}

function TaskQueueControl({ state }: { state: CagnardDataState }) {
  const menu = useHoverDropdown<HTMLDivElement>();
  if (state.tasks.length === 0) return null;

  const summary = taskQueueSummary(state.tasks);

  return (
    <div className={`action-menu-group transfer-queue-menu-group ${summary.kind}`} ref={menu.ref} onMouseEnter={menu.openOnHover} onMouseLeave={menu.closeOnLeave}>
      <button
        aria-expanded={menu.open}
        aria-haspopup="menu"
        aria-label="Task queue"
        className="transfer-queue-trigger"
        onClick={menu.togglePinned}
        title="Task queue"
        type="button"
      >
        {summary.icon}
        <span>{summary.label}</span>
        <strong>{state.tasks.length}</strong>
      </button>
      {menu.open ? (
        <TasksPanel state={state} />
      ) : null}
    </div>
  );
}

function TasksPanel({
  state
}: {
  state: CagnardDataState;
}) {
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());
  const jobs = state.tasks;
  const visibleJobs = jobs;
  const activeCount = jobs.filter(isActiveTask).length;
  const clearableCount = jobs.filter(isTerminalTask).length;
  const toggleExpanded = (jobId: string) => {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };
  return (
    <section className="transfer-jobs" aria-label="Background tasks">
      <div className="transfer-jobs-heading">
        <strong>Tasks</strong>
        <span>{activeCount > 0 ? `${activeCount} active` : `${jobs.length} recent`}</span>
        <button className="primary-button subtle transfer-clear-button" type="button" onClick={() => void state.clearTasks()} disabled={clearableCount === 0}>
          Clear
        </button>
      </div>
      <div className="transfer-job-list">
        {visibleJobs.map((job) => {
          const progress = aggregateTaskProgress(job);
          const canCancel = isActiveTask(job) || job.status === "blocked";
          const canResolve = job.status === "blocked";
          const expanded = expandedTaskIds.has(job.id);
          const presentation = taskPresentation(job.operation);
          return (
            <article className={`transfer-job ${job.status}`} key={job.id}>
              <div className="transfer-job-main">
                <div>
                  <strong className="task-operation-label">{presentation.icon}{presentation.label}</strong>
                  <span>{job.message}</span>
                </div>
                <span className="transfer-job-status">{formatTaskStatus(job.status)}</span>
              </div>
              <div className="transfer-job-progress" aria-label={progress.label}>
                <span style={{ width: `${progress.percent}%` }} />
              </div>
              <div className="transfer-job-meta">
                <span>{progress.label}</span>
                <span>{formatTaskTime(job)}</span>
                <span>{taskLocationLabel(job, state)}</span>
                <button className="icon-button compact" type="button" onClick={() => toggleExpanded(job.id)} title={expanded ? "Hide affected files" : "Show affected files"}>
                  <ListTree size={14} />
                </button>
                {canResolve ? (
                  <button className="primary-button subtle transfer-resolve-button" type="button" onClick={() => void state.resolveTask(job.id)}>
                    Resolve
                  </button>
                ) : null}
                {canCancel ? (
                  <button className="icon-button compact" type="button" onClick={() => void state.cancelTask(job.id)} title={`Cancel ${presentation.label.toLowerCase()} task`}>
                    <X size={14} />
                  </button>
                ) : null}
              </div>
              {expanded ? (
                <TaskDetailList task={job} state={state} />
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TaskDetailList({ task, state }: { task: TaskResponse; state: CagnardDataState }) {
  const [pageRefs, setPageRefs] = useState<Array<string | undefined>>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [page, setPage] = useState<Awaited<ReturnType<CagnardDataState["loadTaskItems"]>>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const pageRef = pageRefs[pageIndex];

  useEffect(() => {
    let active = true;
    if (!page) setLoading(true);
    state.loadTaskItems(task.id, pageRef, 50)
      .then((nextPage) => {
        if (!active) return;
        setPage(nextPage);
        setError(undefined);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [pageIndex, pageRef, state.loadTaskItems, task.id, task.revision]);

  const nextPage = () => {
    if (!page?.nextPageRef) return;
    setPageRefs((current) => [...current.slice(0, pageIndex + 1), page.nextPageRef ?? undefined]);
    setPageIndex((current) => current + 1);
  };

  return (
    <div className="transfer-task-details" aria-busy={loading}>
      {loading && !page ? <p className="transfer-task-empty">Loading affected items...</p> : null}
      {error ? <p className="transfer-task-empty task-detail-error">{error}</p> : null}
      {!loading && !error && (page?.items.length ?? 0) === 0 ? <p className="transfer-task-empty">No affected items reported yet.</p> : null}
      {page?.items.map((item) => (
        <div className={`transfer-task-row ${item.status}`} key={item.id} style={{ paddingLeft: `${Math.min(item.depth ?? 0, 8) * 12}px` }}>
          <div className="transfer-task-main">
            <strong>{item.kind === "directory" ? <Folder size={14} /> : <File size={14} />}{taskItemName(item)}</strong>
            <span>{taskItemPath(item)}</span>
          </div>
          <span className="transfer-task-state">{formatTaskStatus(item.status)}</span>
          <div className="transfer-task-progress" aria-label={taskProgressLabel(item)}>
            <span style={{ width: `${taskProgressPercent(item)}%` }} />
          </div>
          <span className="transfer-task-progress-label">{taskProgressLabel(item)}</span>
        </div>
      ))}
      {page && (pageIndex > 0 || page.nextPageRef) ? (
        <div className="transfer-task-pagination">
          <span>{page.totalCount} items</span>
          <button className="primary-button subtle" type="button" onClick={() => setPageIndex((current) => Math.max(0, current - 1))} disabled={pageIndex === 0 || loading}>
            Previous
          </button>
          <span>Page {pageIndex + 1}</span>
          <button className="primary-button subtle" type="button" onClick={nextPage} disabled={!page.nextPageRef || loading}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function taskQueueSummary(jobs: TaskResponse[]): { icon: ReactNode; kind: string; label: string } {
  const activeCount = jobs.filter(isActiveTask).length;
  if (activeCount > 0) {
    return {
      icon: <LoaderCircle className="transfer-queue-spinner" size={16} />,
      kind: "running",
      label: `${activeCount} active`
    };
  }

  const latestJob = jobs[0];
  if (latestJob && ["error", "failed", "partial", "canceled", "blocked"].includes(latestJob.status)) {
    return {
      icon: <XCircle size={16} />,
      kind: "failed",
      label: "Issue"
    };
  }

  return {
    icon: <CheckCircle2 size={16} />,
    kind: "completed",
    label: "Done"
  };
}

function aggregateTaskProgress(job: TaskResponse): { percent: number; label: string } {
  const totals = job.progress ?? { bytesTransferred: 0, itemsCompleted: 0 };

  if (job.operation === "download" && (totals.bytesDelivered ?? 0) > 0) {
    const delivered = totals.bytesDelivered ?? 0;
    if (totals.totalDeliveredBytes && totals.totalDeliveredBytes > 0) {
      return {
        percent: Math.min(100, Math.round((delivered / totals.totalDeliveredBytes) * 100)),
        label: `${formatSize(delivered)} of ${formatSize(totals.totalDeliveredBytes)} delivered`
      };
    }
    return {
      percent: isTerminalTask(job) ? 100 : 16,
      label: `${formatSize(delivered)} delivered`
    };
  }

  if (totals.totalBytes && totals.totalBytes > 0) {
    return {
      percent: Math.min(100, Math.round((totals.bytesTransferred / totals.totalBytes) * 100)),
      label: `${formatSize(totals.bytesTransferred)} of ${formatSize(totals.totalBytes)}`
    };
  }

  if (totals.totalItems && totals.totalItems > 0) {
    return {
      percent: Math.min(100, Math.round((totals.itemsCompleted / totals.totalItems) * 100)),
      label: `${totals.itemsCompleted} of ${totals.totalItems} items`
    };
  }

  return {
    percent: isTerminalTask(job) ? 100 : 8,
    label: job.status
  };
}

function isActiveTask(job: TaskResponse): boolean {
  return ["pending", "running", "queued", "canceling"].includes(job.status);
}

function isTerminalTask(job: TaskResponse): boolean {
  return ["completed", "canceled", "error", "failed", "partial"].includes(job.status);
}

function taskItemName(task: TaskItem): string {
  if (task.name) return task.name;
  const itemPath = task.targetPath ?? task.sourcePath;
  const parts = itemPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || itemPath || "Root";
}

function taskItemPath(task: TaskItem): string {
  const target = task.targetPath ? ` -> ${task.targetPath}` : "";
  return `${task.sourceTunnel}/${task.sourceRootId}/${task.sourcePath || "/"}${target}`;
}

function taskProgressPercent(task: TaskItem): number {
  const progress = normalizedTaskProgress(task);
  if (progress.totalBytes && progress.totalBytes > 0) {
    return Math.min(100, Math.round((progress.bytesTransferred / progress.totalBytes) * 100));
  }
  if (progress.totalItems && progress.totalItems > 0) {
    return Math.min(100, Math.round((progress.itemsCompleted / progress.totalItems) * 100));
  }
  return ["completed", "copied", "moved", "skipped"].includes(task.status) ? 100 : 8;
}

function taskProgressLabel(task: TaskItem): string {
  const progress = normalizedTaskProgress(task);
  if (progress.totalBytes && progress.totalBytes > 0) {
    return `${formatSize(progress.bytesTransferred)} of ${formatSize(progress.totalBytes)}`;
  }
  if (progress.totalItems && progress.totalItems > 0) {
    return `${progress.itemsCompleted} of ${progress.totalItems} items`;
  }
  return task.status;
}

function normalizedTaskProgress(task: TaskItem): TaskItem["progress"] {
  const progress = { ...task.progress };
  const completed = ["completed", "copied", "moved", "skipped"].includes(task.status) || ["copied", "moved", "skipped"].includes(task.result?.status ?? "");
  const resultSize = task.result?.entry?.metadata.size;

  if (resultSize != null && progress.totalBytes == null) {
    progress.totalBytes = resultSize;
  }
  if (completed) {
    if (progress.totalItems != null && progress.itemsCompleted < progress.totalItems) {
      progress.itemsCompleted = progress.totalItems;
    }
    if (progress.totalBytes != null && progress.bytesTransferred < progress.totalBytes) {
      progress.bytesTransferred = progress.totalBytes;
    }
  }

  return progress;
}

function taskLocationLabel(job: TaskResponse, state: CagnardDataState): string {
  const roots = [
    ...(state.navigation?.personal?.roots ?? []),
    ...(state.navigation?.global?.roots ?? [])
  ];
  if (job.operation === "download") return "to this browser";
  const location = job.operation === "delete" ? job.initiatedFrom : job.destination;
  const root = roots.find(candidate => candidate.tunnel === location?.tunnel && candidate.id === location?.rootId);
  const rootLabel = root?.label ?? location?.rootId ?? "storage";
  const prefix = job.operation === "delete" ? "from" : "to";
  return location?.path ? `${prefix} ${rootLabel} / ${location.path}` : `${prefix} ${rootLabel}`;
}

function taskPresentation(operation: string): { label: string; icon: ReactNode } {
  const label = taskOperationLabel(operation);
  switch (operation) {
    case "copy": return { label, icon: <CopyPlus size={15} /> };
    case "move": return { label, icon: <MoveRight size={15} /> };
    case "delete": return { label, icon: <Trash2 size={15} /> };
    case "download": return { label, icon: <Download size={15} /> };
    case "upload": return { label, icon: <Upload size={15} /> };
    default: return { label, icon: <ListTree size={15} /> };
  }
}

function formatTaskStatus(status: string): string {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
}

function formatTaskTime(job: TaskResponse): string {
  const timestamp = job.updatedAt || job.createdAt;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "time unavailable";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface ActionDefinition {
  icon: ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
}

function ActionMenuGroup({
  primary,
  items,
  className,
}: {
  primary: ActionDefinition;
  items: ActionDefinition[];
  className?: string;
}) {
  const menu = useHoverDropdown<HTMLDivElement>();

  return (
    <div className={`action-menu-group${className ? ` ${className}` : ""}`} ref={menu.ref} onMouseEnter={menu.openOnHover} onMouseLeave={menu.closeOnLeave}>
      <ActionButton
        {...primary}
        primary
        onClick={async () => {
          menu.close();
          await primary.onClick();
        }}
      />
      <div className="action-menu">
        <button
          aria-expanded={menu.open}
          aria-haspopup="menu"
          aria-label={`${primary.label} options`}
          className="action-menu-trigger"
          onClick={menu.togglePinned}
          onKeyDown={(event) => {
            if (!["Enter", " ", "ArrowDown"].includes(event.key)) return;
            menu.togglePinned(event);
          }}
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
      setOpen(false);
    },
    togglePinned: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
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
      aria-label={action.disabledReason
        ? `${action.label}: ${action.disabledReason}`
        : undefined}
      className={className}
      disabled={action.disabled}
      role="menuitem"
      title={action.disabledReason ?? action.label}
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
      <ActionButton
        icon={<CopyPlus size={17} />}
        label="Copy"
        onClick={async () => {
          menu.close();
          await state.copySelected();
        }}
        disabled={!hasSelection}
        primary
      />
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
        <PaginationControls state={state} />
        <button
          className={metadataOpen ? "metadata-toggle active" : "metadata-toggle"}
          type="button"
          onClick={onToggleMetadata}
          title="Metadata"
        >
          <Info size={15} />
          <span>Metadata</span>
        </button>
        <span>{browserCountLabel(state)}</span>
        {state.selectionCount > 0 ? (
          <button className="icon-button compact" type="button" onClick={state.clearSelection} title="Clear selection">
            <X size={15} />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function PaginationControls({ state }: { state: CagnardDataState }) {
  return (
    <div className="pagination-controls" aria-label="Directory pagination">
      <button
        className="icon-button compact"
        type="button"
        onClick={state.goToPreviousEntryPage}
        disabled={!state.entryPage.canGoPrevious || state.loading}
        title="Previous page"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="page-number">Page {state.entryPage.currentPage}</span>
      <button
        className="icon-button compact"
        type="button"
        onClick={state.goToNextEntryPage}
        disabled={!state.entryPage.canGoNext || state.loading}
        title="Next page"
      >
        <ChevronRight size={15} />
      </button>
      <label className="page-size-control" title="Entries per page">
        <span>Rows</span>
        <select value={state.entryPageSize} onChange={(event) => state.setEntryPageSize(Number(event.target.value))}>
          {[25, 50, 100, 250, 500].map((size) => (
            <option value={size} key={size}>{size}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function browserCountLabel(state: CagnardDataState): string {
  if (state.selectionCount > 0) return `${state.selectionCount} selected on this page`;
  const pageCount = state.entries.length;
  if (state.entryPage.filteredCount !== undefined && state.entryPage.filteredCount !== null) {
    if (state.entryPage.totalCount !== undefined && state.entryPage.totalCount !== null && state.entryPage.filteredCount !== state.entryPage.totalCount) {
      return `${pageCount} of ${state.entryPage.filteredCount} matches`;
    }
    return `${pageCount} of ${state.entryPage.filteredCount}`;
  }
  if (state.entryPage.hasMore) return `${pageCount} shown`;
  return `${pageCount} entries`;
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

function handleEntryClick(event: MouseEvent<HTMLElement>, entry: StorageEntry, state: CagnardDataState) {
  if (event.shiftKey || event.metaKey || event.ctrlKey) {
    state.selectEntry(entry, selectionMode(event));
    return;
  }

  void state.openEntry(entry);
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
  const canEdit = match?.opener.mode === "editor" && match.opener.editMode !== "none" && !opened.truncated;
  const canSave = Boolean(
    match && match.opener.saveStrategy === "overwrite" && opened.dirty && !opened.loading && !opened.truncated && state.selectedRoot && !state.selectedRoot.readOnly
  );
  const hasSource = Boolean(match && openerSupportsRaw(match.opener) && opened.content !== undefined);
  const searchable = hasSource;

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentMatch, setCurrentMatch] = useState(0);
  const priorViewMode = useRef<OpenedFileViewMode>();

  const { ranges, error: searchError } = useMemo(
    () => findMatches(content, query, regex, caseSensitive),
    [content, query, regex, caseSensitive]
  );
  const searching = searchOpen && query.trim().length > 0;

  useEffect(() => {
    setCurrentMatch(0);
  }, [content, query, regex, caseSensitive]);

  const [follow, setFollow] = useState(false);
  const isLogView = match?.opener.view === "log" && opened.viewMode === "log";
  const canFollow = isLogView && logWatchable(entry);

  useEffect(() => {
    setSearchOpen(false);
    setQuery("");
    setFollow(false);
    priorViewMode.current = undefined;
  }, [entry.path]);

  const setViewMode = state.setOpenedFileViewMode;
  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => {
      const next = !open;
      if (next && hasSource && opened.viewMode !== "source") {
        priorViewMode.current = opened.viewMode;
        setViewMode("source");
      } else if (!next && priorViewMode.current) {
        setViewMode(priorViewMode.current);
        priorViewMode.current = undefined;
      }
      return next;
    });
  }, [hasSource, opened.viewMode, setViewMode]);

  const gotoMatch = useCallback(
    (step: number) => {
      if (ranges.length === 0) return;
      if (opened.viewMode !== "source" && hasSource) setViewMode("source");
      setCurrentMatch((index) => (index + step + ranges.length) % ranges.length);
    },
    [ranges.length, opened.viewMode, hasSource, setViewMode]
  );

  return (
    <section className={`${inline ? "file-opener inline-file-opener" : "file-opener page-file-opener"}${opened.loading ? " pending" : ""}`} aria-busy={opened.loading}>
      <header className="file-opener-header">
        <div className="file-opener-title">
          <EntryIcon entry={entry} size={20} />
          <div>
            <h2>{entry.name}</h2>
            <p>{match ? `${match.opener.label} / ${match.reason}` : classification.label}</p>
          </div>
        </div>
        <div className="file-opener-actions">
          {isLogView ? (
            <button
              className={follow ? "icon-button active" : "icon-button"}
              type="button"
              onClick={() => setFollow((value) => !value)}
              disabled={!canFollow}
              title={!canFollow ? "Live follow is not available for this storage provider" : follow ? "Stop following" : "Follow new lines"}
              aria-pressed={follow}
            >
              {follow ? <Pause size={17} /> : <Play size={17} />}
            </button>
          ) : null}
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
          {searchable ? (
            <button
              className={searchOpen ? "icon-button active" : "icon-button"}
              type="button"
              onClick={toggleSearch}
              title="Search in file"
              aria-pressed={searchOpen}
            >
              <Search size={17} />
            </button>
          ) : null}
          {match?.opener.saveStrategy === "overwrite" ? (
            <button className="icon-button" type="button" onClick={() => void state.saveOpenedFile()} disabled={!canSave} title="Save">
              <Save size={17} />
            </button>
          ) : null}
          <button className="icon-button" type="button" onClick={state.closeOpenedFile} title="Close">
            <X size={17} />
          </button>
        </div>
      </header>

      {searchable && searchOpen ? (
        <div className="content-search">
          <form
            className="content-search-controls"
            onSubmit={(event) => {
              event.preventDefault();
              gotoMatch(1);
            }}
          >
            <input type="search" placeholder="Search in file" value={query} autoFocus onChange={(event) => setQuery(event.target.value)} />
            <label>
              <input type="checkbox" checked={regex} onChange={() => setRegex((value) => !value)} /> Regex
            </label>
            <label>
              <input type="checkbox" checked={caseSensitive} onChange={() => setCaseSensitive((value) => !value)} /> Match case
            </label>
            <span className="content-search-count">
              {searchError ? searchError : ranges.length > 0 ? `${currentMatch + 1} / ${ranges.length}` : query.trim() ? "No matches" : ""}
            </span>
            <button className="icon-button compact" type="button" onClick={() => gotoMatch(-1)} disabled={ranges.length === 0} title="Previous match">
              <ChevronUp size={16} />
            </button>
            <button className="icon-button compact" type="button" onClick={() => gotoMatch(1)} disabled={ranges.length === 0} title="Next match">
              <ChevronDown size={16} />
            </button>
          </form>
        </div>
      ) : null}

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

      <div className="file-opener-body">
        {opened.loading ? (
          <div className="opener-pending" aria-live="polite">
            <LoaderCircle className="pending-spinner" size={22} />
            <span className="visually-hidden">Opening file</span>
          </div>
        ) : (
          <>
          {!match ? <UnsupportedFile entry={entry} classification={classification} /> : null}
          {match?.opener.view === "archive" ? (
            archiveBrowsable(entry.name) && state.selectedRoot ? (
              <ArchiveView root={state.selectedRoot} entry={entry} />
            ) : (
              <ArchiveMetadata entry={entry} classification={classification} />
            )
          ) : null}
          {match?.opener.view === "structured-data" && state.selectedRoot ? (
            <Suspense fallback={<div className="structured-loading"><LoaderCircle className="spin" size={20} /> Loading data viewer</div>}>
              <StructuredDataView
                entry={entry}
                format={match.opener.id as StructuredFormatId}
                contentUrl={cagnardApi.contentUrl(
                  state.selectedRoot.tunnel,
                  state.selectedRoot.id,
                  entry.path,
                  entry.metadata.version ?? entry.metadata.modifiedTime
                )}
              />
            </Suspense>
          ) : null}
          {match?.opener.view === "media" && opened.contentUrl ? <MediaViewer entry={entry} classification={classification} url={opened.contentUrl} /> : null}
          {match?.opener.view === "pdf" && opened.contentUrl ? <iframe className="pdf-viewer" src={opened.contentUrl} title={entry.name} /> : null}
          {match?.opener.view === "markdown" && opened.viewMode === "rendered" ? <MarkdownView content={content} /> : null}
          {match?.opener.view === "json" && opened.viewMode === "tree" ? <JsonView content={content} /> : null}
          {match?.opener.view === "yaml" && opened.viewMode === "tree" ? <YamlView content={content} /> : null}
          {match?.opener.view === "diff" && opened.viewMode === "diff" ? <DiffView content={content} /> : null}
          {match?.opener.view === "log" && opened.viewMode === "log" ? <LogView state={state} opened={opened} content={content} follow={follow} /> : null}
          {match && shouldShowSource(opened.viewMode) ? (
            searching ? (
              <SearchableSource content={content} ranges={ranges} currentIndex={currentMatch} />
            ) : canEdit ? (
              <textarea className="source-editor" value={content} onChange={(event) => state.updateOpenedFileContent(event.target.value)} spellCheck={false} />
            ) : (
              <HighlightedSource content={content} fileName={entry.name} />
            )
          ) : null}
          {opened.truncated ? (
            <div className="load-more-row">
              <span className="muted">
                Showing {formatSize(new Blob([opened.content ?? ""]).size)} of {formatSize(opened.totalSize ?? undefined)}
              </span>
              <button type="button" className="primary-button subtle" disabled={opened.loadingMore} onClick={() => void state.loadMoreOpenedFile()}>
                {opened.loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
          </>
        )}
      </div>
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

function archiveBrowsable(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".zip") || lower.endsWith(".tar") || lower.endsWith(".tar.gz") || lower.endsWith(".tgz") || lower.endsWith(".gz");
}

interface InnerArchiveEntryState {
  item: ArchiveEntry;
  fake: StorageEntry;
  view?: string;
  url?: string;
  content?: string;
  error?: string;
  loading?: boolean;
}

function ArchiveView({ root, entry }: { root: { tunnel: string; id: string }; entry: StorageEntry }) {
  const [entries, setEntries] = useState<ArchiveEntry[]>();
  const [listError, setListError] = useState<string>();
  const [stack, setStack] = useState<string[]>([]);
  const [inner, setInner] = useState<InnerArchiveEntryState>();

  useEffect(() => {
    let active = true;
    setEntries(undefined);
    setListError(undefined);
    setInner(undefined);
    cagnardApi
      .archiveEntries(root.tunnel, root.id, entry.path, stack.join("!/") || undefined)
      .then((response) => {
        if (active) setEntries(response.entries.filter((item) => item.kind === "file"));
      })
      .catch((caught: Error) => {
        if (active) setListError(caught.message);
      });
    return () => {
      active = false;
    };
  }, [entry.path, root.id, root.tunnel, stack]);

  const openInner = async (item: ArchiveEntry) => {
    if (archiveBrowsable(item.name)) {
      setStack((current) => [...current, item.path]);
      return;
    }
    const innerPath = [...stack, item.path].join("!/");
    const fake = synthesizeArchiveEntry(item, entry.path);
    const match = resolveFileOpener(fake);
    if (!match) {
      setInner({ item, fake, error: "No compatible opener is available for this archive entry." });
      return;
    }
    const view = match.opener.view;
    if (view === "structured-data") {
      setInner({ item, fake, error: "Extract this entry before opening its structured-data viewer." });
      return;
    }
    if (view === "media" || view === "pdf") {
      setInner({ item, fake, view, url: cagnardApi.archiveEntryUrl(root.tunnel, root.id, entry.path, innerPath) });
      return;
    }
    setInner({ item, fake, view, loading: true });
    try {
      const content = await cagnardApi.archiveEntryText(root.tunnel, root.id, entry.path, innerPath);
      setInner({ item, fake, view, content });
    } catch (caught) {
      setInner({ item, fake, error: caught instanceof Error ? caught.message : String(caught) });
    }
  };

  return (
    <div className="archive-view">
      <div className="archive-toolbar">
        <span className="archive-crumbs">{[entry.name, ...stack].join(" / ")}</span>
        {stack.length > 0 ? (
          <button type="button" className="primary-button subtle" onClick={() => setStack((current) => current.slice(0, -1))}>
            Back
          </button>
        ) : null}
      </div>
      {listError ? <div className="error-banner">{listError}</div> : null}
      {entries === undefined && !listError ? <p className="muted">Reading archive…</p> : null}
      {entries !== undefined && entries.length === 0 ? <p className="muted">This archive contains no files.</p> : null}
      {entries !== undefined && entries.length > 0 ? (
        <ul className="archive-list">
          {entries.map((item) => (
            <li key={item.path}>
              <button type="button" className={inner?.item.path === item.path ? "active" : undefined} onClick={() => void openInner(item)}>
                <span className="archive-entry-path">{item.path}</span>
                <span className="archive-entry-size">{item.size !== null && item.size !== undefined ? formatSize(item.size) : "—"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {inner ? <InnerArchivePreview inner={inner} /> : null}
    </div>
  );
}

function InnerArchivePreview({ inner }: { inner: InnerArchiveEntryState }) {
  if (inner.error) return <div className="error-banner">{inner.error}</div>;
  if (inner.loading) return <p className="muted">Opening {inner.item.name}…</p>;
  const classification = classifyEntry(inner.fake);
  return (
    <div className="archive-entry-preview">
      <h3>{inner.item.path}</h3>
      {inner.view === "media" && inner.url ? <MediaViewer entry={inner.fake} classification={classification} url={inner.url} /> : null}
      {inner.view === "pdf" && inner.url ? <iframe className="pdf-viewer" src={inner.url} title={inner.item.name} /> : null}
      {inner.view === "markdown" && inner.content !== undefined ? <MarkdownView content={inner.content} /> : null}
      {inner.view === "json" && inner.content !== undefined ? <JsonView content={inner.content} /> : null}
      {inner.view === "yaml" && inner.content !== undefined ? <YamlView content={inner.content} /> : null}
      {inner.view === "diff" && inner.content !== undefined ? <DiffView content={inner.content} /> : null}
      {inner.view === "log" && inner.content !== undefined ? <LogLines content={inner.content} /> : null}
      {inner.view === "text" && inner.content !== undefined ? <HighlightedSource content={inner.content} fileName={inner.item.name} /> : null}
    </div>
  );
}

function synthesizeArchiveEntry(item: ArchiveEntry, containerPath: string): StorageEntry {
  return {
    id: `${containerPath}!/${item.path}`,
    name: item.name,
    path: `${containerPath}!/${item.path}`,
    kind: "file",
    metadata: { size: item.size ?? 0, unavailable: [] },
    capabilities: [
      { name: "open", status: "supported" },
      { name: "download", status: "supported" },
      { name: "bounded-read", status: "supported" },
      { name: "full-read", status: "supported" }
    ],
    providerSpecific: {}
  };
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

function viewTabs(
  view: string,
  hasSource: boolean
): Array<{ label: string; value: "archive" | "diff" | "log" | "media" | "pdf" | "rendered" | "source" | "table" | "tree" }> {
  switch (view) {
    case "archive":
      return [{ label: "Metadata", value: "archive" }];
    case "structured-data":
      return [{ label: "Table", value: "table" }];
    case "diff":
      return [{ label: "Diff", value: "diff" }, ...(hasSource ? [{ label: "Source", value: "source" as const }] : [])];
    case "log":
      return [{ label: "Log", value: "log" }, ...(hasSource ? [{ label: "Source", value: "source" as const }] : [])];
    case "json":
    case "yaml":
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

const highlightLimitBytes = 256 * 1024;

function HighlightedSource({ content, fileName }: { content: string; fileName: string }) {
  const language = highlightLanguageOf(fileName);
  const highlighted = useMemo(() => {
    if (!language || content.length > highlightLimitBytes) return undefined;
    try {
      return hljs.highlight(content, { language }).value;
    } catch {
      return undefined;
    }
  }, [content, language]);
  if (highlighted === undefined) return <pre className="source-view">{content}</pre>;
  // highlight.js escapes the source before wrapping tokens in spans.
  return <pre className="source-view hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />;
}

function YamlView({ content }: { content: string }) {
  try {
    return <JsonNode value={YAML.parse(content)} />;
  } catch (caught) {
    return <pre className="source-view">Invalid YAML: {caught instanceof Error ? caught.message : String(caught)}</pre>;
  }
}

function DiffView({ content }: { content: string }) {
  return (
    <pre className="source-view diff-view">
      {content.split(/\r?\n/).map((line, index) => (
        <span className={`diff-line ${diffLineClass(line)}`} key={index}>
          {line}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

function diffLineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "diff-file";
  if (line.startsWith("@@")) return "diff-hunk";
  if (line.startsWith("+")) return "diff-add";
  if (line.startsWith("-")) return "diff-remove";
  if (line.startsWith("diff ") || line.startsWith("index ")) return "diff-meta";
  return "diff-context";
}

function logWatchable(entry: StorageEntry): boolean {
  return entry.capabilities.some((capability) => capability.name === "watch" && capability.status !== "unsupported");
}

// scrollToBottom pins the nearest scrollable ancestor to the bottom. The log
// view scrolls internally when opened inline but through .file-opener-body at
// page level, so it walks up from the <pre> to whichever element scrolls.
function scrollToBottom(start: HTMLElement | null): void {
  let node: HTMLElement | null = start;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      node.scrollTop = node.scrollHeight;
      return;
    }
    node = node.parentElement;
  }
}

function LogView({ state, opened, content, follow }: { state: CagnardDataState; opened: OpenedFileState; content: string; follow: boolean }) {
  const [removed, setRemoved] = useState(false);
  const entry = opened.entry;
  const watchable = logWatchable(entry);
  const containerRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    setRemoved(false);
  }, [entry.path]);

  useFileWatch(follow && watchable && !removed, state.selectedRoot, entry.path, {
    onAppended: (event) => {
      if (event.length > 0) void state.loadMoreOpenedFile(true);
    },
    onReplaced: () => {
      // Rotation or truncation: the previous offsets no longer describe this
      // file, so reload from the start instead of appending.
      setRemoved(false);
      void state.reloadOpenedFile();
    },
    onRemoved: () => setRemoved(true)
  });

  useEffect(() => {
    if (!follow || !opened.truncated || opened.loadingMore) return;
    // A single append can outgrow one preview page; keep draining while
    // following so the view catches up to the end of the file.
    void state.loadMoreOpenedFile();
  }, [follow, opened.loadingMore, opened.truncated, state]);

  useEffect(() => {
    if (!follow) return;
    scrollToBottom(containerRef.current);
  }, [content, follow]);

  return (
    <div className="log-view-wrap">
      {removed ? <div className="log-removed">The file was removed from storage.</div> : null}
      <LogLines content={content} containerRef={containerRef} />
    </div>
  );
}

function LogLines({ content, containerRef }: { content: string; containerRef?: RefObject<HTMLPreElement> }) {
  return (
    <pre className="source-view log-view" ref={containerRef}>
      {content.split(/\r?\n/).map((line, index) => (
        <span className={`log-line ${logLineClass(line)}`} key={index}>
          {line}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

function logLineClass(line: string): string {
  if (/\b(FATAL|ERROR|ERR|SEVERE)\b/i.test(line)) return "log-error";
  if (/\b(WARN|WARNING)\b/i.test(line)) return "log-warn";
  if (/\b(DEBUG|TRACE|FINE)\b/i.test(line)) return "log-debug";
  if (/\b(INFO|NOTICE)\b/i.test(line)) return "log-info";
  return "log-plain";
}

interface MatchRange {
  start: number;
  end: number;
}

const searchMatchLimit = 5000;

// findMatches locates every occurrence of the query within the loaded content,
// returning character ranges for inline highlighting.
function findMatches(content: string, query: string, useRegex: boolean, caseSensitive: boolean): { ranges: MatchRange[]; error?: string } {
  if (!query.trim() || content.length === 0) return { ranges: [] };
  const ranges: MatchRange[] = [];
  if (useRegex) {
    let expression: RegExp;
    try {
      expression = new RegExp(query, caseSensitive ? "g" : "gi");
    } catch {
      return { ranges: [], error: "Invalid pattern" };
    }
    let found: RegExpExecArray | null;
    while ((found = expression.exec(content)) !== null) {
      if (found[0].length === 0) {
        expression.lastIndex += 1;
        continue;
      }
      ranges.push({ start: found.index, end: found.index + found[0].length });
      if (ranges.length >= searchMatchLimit) break;
    }
  } else {
    const haystack = caseSensitive ? content : content.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    let index = 0;
    while ((index = haystack.indexOf(needle, index)) !== -1) {
      ranges.push({ start: index, end: index + needle.length });
      index += needle.length;
      if (ranges.length >= searchMatchLimit) break;
    }
  }
  return { ranges };
}

// SearchableSource renders raw file content with every match wrapped in a
// <mark>, the active match emphasized, and that active match scrolled into view.
function SearchableSource({ content, ranges, currentIndex }: { content: string; ranges: MatchRange[]; currentIndex: number }) {
  const currentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, [currentIndex]);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) nodes.push(content.slice(cursor, range.start));
    nodes.push(
      <mark
        key={index}
        ref={index === currentIndex ? currentRef : undefined}
        className={index === currentIndex ? "search-hit current" : "search-hit"}
      >
        {content.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });
  if (cursor < content.length) nodes.push(content.slice(cursor));

  return <pre className="source-view">{nodes}</pre>;
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
