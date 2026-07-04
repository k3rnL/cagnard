import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cagnardApi, isUnauthorizedError } from "./client";
import type {
  AuthProviderMetadata,
  EntryListResponse,
  NavigationResponse,
  NavigationRoot,
  SessionResponse,
  StorageEntry,
  TransferConflictPolicy,
  TransferItemResult,
  UiPluginManifest
} from "./types";
import { classifyEntry } from "../plugins/fileTypeCatalog";
import { canWriteBack, openerBlockedReason, resolveFileOpener } from "../plugins/fileOpeners";
import type { FileOpenerMatch, OpenerView } from "../plugins/fileOpeners";

export type EntrySelectionMode = "replace" | "toggle" | "range";
export type EntrySortField = "name" | "kind" | "fileCategory" | "size" | "modifiedTime" | "mimeType";
export type EntrySortDirection = "asc" | "desc";
export type OpenedFileViewMode = "archive" | "media" | "pdf" | "rendered" | "source" | "table" | "tree";
export type OpenedFilePlacement = "page" | "inline";

export interface OpenedFileState {
  entry: StorageEntry;
  match?: FileOpenerMatch;
  placement: OpenedFilePlacement;
  loading: boolean;
  error?: string;
  content?: string;
  editedContent?: string;
  blobUrl?: string;
  viewMode: OpenedFileViewMode;
  dirty: boolean;
}

export type BrowserModalResult = string | boolean | ConflictModalResult | undefined;

export interface ConflictModalResult {
  policy: TransferConflictPolicy;
  applyToAll: boolean;
}

export type BrowserModalState =
  | {
      id: number;
      kind: "text";
      title: string;
      label: string;
      defaultValue?: string;
      confirmLabel: string;
      placeholder?: string;
      validate?: (value: string) => string | undefined;
    }
  | {
      id: number;
      kind: "confirm";
      title: string;
      message: string;
      confirmLabel: string;
      danger?: boolean;
    }
  | {
      id: number;
      kind: "message";
      title: string;
      message: string;
      confirmLabel?: string;
      danger?: boolean;
    }
  | {
      id: number;
      kind: "conflict";
      title: string;
      message: string;
      canReplace: boolean;
      canKeepBoth: boolean;
    };

export type BrowserModalDraft =
  | Omit<Extract<BrowserModalState, { kind: "text" }>, "id">
  | Omit<Extract<BrowserModalState, { kind: "confirm" }>, "id">
  | Omit<Extract<BrowserModalState, { kind: "message" }>, "id">
  | Omit<Extract<BrowserModalState, { kind: "conflict" }>, "id">;

export type PasteboardIntent = "copy" | "move";

export interface PasteboardItem {
  id: string;
  intent: PasteboardIntent;
  selected: boolean;
  addedAt: number;
  source: {
    tunnel: "personal" | "global";
    rootId: string;
    rootLabel: string;
    providerFamily: string;
    providerId: string;
    accountId: string;
    readOnly: boolean;
    path: string;
  };
  entry: StorageEntry;
}

export interface CagnardDataState {
  session?: SessionResponse;
  authProviders: AuthProviderMetadata[];
  authenticated: boolean;
  navigation?: NavigationResponse;
  selectedRoot?: NavigationRoot;
  currentPath: string;
  breadcrumbs: Array<{ label: string; path: string }>;
  entries: StorageEntry[];
  totalEntryCount: number;
  filterQuery: string;
  sortField: EntrySortField;
  sortDirection: EntrySortDirection;
  selectedEntry?: StorageEntry;
  selectedEntries: StorageEntry[];
  selectedEntryIds: string[];
  selectionCount: number;
  uiPlugins: UiPluginManifest[];
  openedFile?: OpenedFileState;
  modal?: BrowserModalState;
  pasteboardItems: PasteboardItem[];
  pasteboardSelectedCount: number;
  pasteboardBusy: boolean;
  operationMessage?: string;
  loginLoading: boolean;
  loginError?: string;
  loading: boolean;
  error?: string;
  login: (providerId: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectRoot: (root: NavigationRoot) => void;
  selectEntry: (entry: StorageEntry, mode?: EntrySelectionMode) => void;
  selectAllEntries: () => void;
  clearSelection: () => void;
  setFilterQuery: (query: string) => void;
  setSort: (field: EntrySortField) => void;
  openEntry: (entry: StorageEntry) => Promise<void>;
  openInlineEntry: (entry: StorageEntry) => Promise<void>;
  openSelected: () => Promise<void>;
  closeOpenedFile: () => void;
  setOpenedFileViewMode: (mode: OpenedFileViewMode) => void;
  updateOpenedFileContent: (content: string) => void;
  prettifyOpenedJson: () => void;
  minifyOpenedJson: () => void;
  saveOpenedFile: () => Promise<void>;
  openDirectory: (entry: StorageEntry) => void;
  navigateToPath: (path: string) => void;
  goUp: () => void;
  refresh: () => void;
  createFile: () => Promise<void>;
  createFolder: () => Promise<void>;
  renameSelected: () => Promise<void>;
  deleteSelected: () => Promise<void>;
  copySelected: () => Promise<void>;
  moveSelected: () => Promise<void>;
  removePasteboardItem: (id: string) => void;
  clearPasteboard: () => void;
  togglePasteboardItem: (id: string) => void;
  pasteboardTransfer: (intent?: PasteboardIntent) => Promise<void>;
  cancelModal: () => void;
  submitModal: (value: BrowserModalResult) => void;
  showMessage: (title: string, message: string, danger?: boolean) => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  downloadSelected: () => Promise<void>;
}

export function useCagnardData(): CagnardDataState {
  const [session, setSession] = useState<SessionResponse>();
  const [authProviders, setAuthProviders] = useState<AuthProviderMetadata[]>([]);
  const [navigation, setNavigation] = useState<NavigationResponse>();
  const [selectedRoot, setSelectedRoot] = useState<NavigationRoot>();
  const [currentPath, setCurrentPath] = useState("");
  const [entryResponse, setEntryResponse] = useState<EntryListResponse>();
  const [filterQuery, setFilterQueryState] = useState("");
  const [sortField, setSortField] = useState<EntrySortField>("name");
  const [sortDirection, setSortDirection] = useState<EntrySortDirection>("asc");
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [activeEntryId, setActiveEntryId] = useState<string>();
  const [lastSelectedEntryId, setLastSelectedEntryId] = useState<string>();
  const [uiPlugins, setUiPlugins] = useState<UiPluginManifest[]>([]);
  const [openedFile, setOpenedFile] = useState<OpenedFileState>();
  const [modal, setModal] = useState<BrowserModalState>();
  const [pasteboardItems, setPasteboardItems] = useState<PasteboardItem[]>([]);
  const [pasteboardBusy, setPasteboardBusy] = useState(false);
  const [operationMessage, setOperationMessage] = useState<string>();
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [refreshTick, setRefreshTick] = useState(0);
  const modalSequence = useRef(0);
  const modalResolver = useRef<((value: BrowserModalResult) => void) | undefined>();
  const pasteboardChannel = useRef<BroadcastChannel | undefined>();
  const pasteboardItemsRef = useRef<PasteboardItem[]>([]);
  const pasteboardBroadcastReady = useRef(false);
  const suppressPasteboardBroadcast = useRef(false);

  const pasteboardSelectedCount = useMemo(
    () => pasteboardItems.filter((item) => item.selected).length,
    [pasteboardItems]
  );

  const sourceEntries = useMemo(() => entryResponse?.entries ?? [], [entryResponse]);
  const normalizedFilter = filterQuery.trim().toLowerCase();
  const filteredEntries = useMemo(() => {
    if (!normalizedFilter) return sourceEntries;
    const terms = normalizedFilter.split(/\s+/).filter(Boolean);
    return sourceEntries.filter((entry) => {
      const haystack = entrySearchHaystack(entry);
      return terms.every((term) => haystack.includes(term));
    });
  }, [normalizedFilter, sourceEntries]);
  const entries = useMemo(
    () => sortEntries(filteredEntries, sortField, sortDirection),
    [filteredEntries, sortDirection, sortField]
  );
  const filteredEntryIds = useMemo(() => new Set(entries.map((entry) => entry.id)), [entries]);
  const entriesById = useMemo(() => new Map(sourceEntries.map((entry) => [entry.id, entry])), [sourceEntries]);
  const selectedEntries = useMemo(
    () => selectedEntryIds.flatMap((id) => entriesById.get(id) ?? []),
    [entriesById, selectedEntryIds]
  );
  const selectedEntry = useMemo(() => {
    if (activeEntryId) return entriesById.get(activeEntryId) ?? selectedEntries[0];
    return selectedEntries[0];
  }, [activeEntryId, entriesById, selectedEntries]);

  useEffect(() => {
    pasteboardItemsRef.current = pasteboardItems;
  }, [pasteboardItems]);

  const openModal = useCallback((nextModal: BrowserModalDraft) => {
    modalResolver.current?.(undefined);
    const id = modalSequence.current + 1;
    modalSequence.current = id;
    setModal({ ...nextModal, id } as BrowserModalState);
    return new Promise<BrowserModalResult>((resolve) => {
      modalResolver.current = resolve;
    });
  }, []);

  const submitModal = useCallback((value: BrowserModalResult) => {
    modalResolver.current?.(value);
    modalResolver.current = undefined;
    setModal(undefined);
  }, []);

  const cancelModal = useCallback(() => {
    modalResolver.current?.(undefined);
    modalResolver.current = undefined;
    setModal(undefined);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEntryIds([]);
    setActiveEntryId(undefined);
    setLastSelectedEntryId(undefined);
  }, []);

  const resetAuthenticatedState = useCallback(() => {
    setSession(undefined);
    setNavigation(undefined);
    setSelectedRoot(undefined);
    setCurrentPath("");
    setEntryResponse(undefined);
    setUiPlugins([]);
    setOpenedFile(undefined);
    modalResolver.current?.(undefined);
    modalResolver.current = undefined;
    setModal(undefined);
    setPasteboardItems([]);
    setOperationMessage(undefined);
    clearSelection();
  }, [clearSelection]);

  const handleUnauthorized = useCallback(
    (caught: unknown): boolean => {
      if (!isUnauthorizedError(caught)) return false;
      resetAuthenticatedState();
      setError(undefined);
      return true;
    },
    [resetAuthenticatedState]
  );

  const loadApplication = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSession, nextNavigation, plugins] = await Promise.all([
        cagnardApi.session(),
        cagnardApi.navigation(),
        cagnardApi.uiPlugins()
      ]);
      setSession(nextSession);
      setNavigation(nextNavigation);
      setUiPlugins(plugins.plugins);
      setSelectedRoot((existing) => existing ?? firstRoot(nextNavigation));
      setError(undefined);
    } catch (caught) {
      if (!handleUnauthorized(caught)) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    let active = true;

    cagnardApi
      .authProviders()
      .then((response) => {
        if (!active) return;
        setAuthProviders(response.providers);
      })
      .catch((caught: Error) => {
        if (active) setError(caught.message);
      });

    void loadApplication();

    return () => {
      active = false;
    };
  }, [loadApplication]);

  useEffect(() => {
    if (!session?.user.id || typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(`cagnard-pasteboard:${session.user.id}`);
    pasteboardChannel.current = channel;
    pasteboardBroadcastReady.current = false;

    channel.onmessage = (event: MessageEvent<{ type: string; items?: PasteboardItem[] }>) => {
      if (event.data?.type === "request") {
        channel.postMessage({ type: "update", items: pasteboardItemsRef.current });
        return;
      }

      if (event.data?.type === "update" && Array.isArray(event.data.items)) {
        suppressPasteboardBroadcast.current = true;
        setPasteboardItems(event.data.items);
      }
    };

    channel.postMessage({ type: "request" });

    return () => {
      channel.close();
      if (pasteboardChannel.current === channel) pasteboardChannel.current = undefined;
    };
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) return;
    if (!pasteboardBroadcastReady.current) {
      pasteboardBroadcastReady.current = true;
      suppressPasteboardBroadcast.current = false;
      return;
    }
    if (suppressPasteboardBroadcast.current) {
      suppressPasteboardBroadcast.current = false;
      return;
    }
    pasteboardChannel.current?.postMessage({ type: "update", items: pasteboardItems });
  }, [pasteboardItems, session?.user.id]);

  useEffect(() => {
    if (!session || !selectedRoot) return;
    let active = true;
    setLoading(true);

    cagnardApi
      .entries(selectedRoot.tunnel, selectedRoot.id, currentPath)
      .then((nextEntries) => {
        if (!active) return;
        setEntryResponse(nextEntries);
        clearSelection();
        setError(undefined);
      })
      .catch((caught: Error) => {
        if (!active) return;
        if (!handleUnauthorized(caught)) setError(caught.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [clearSelection, currentPath, handleUnauthorized, selectedRoot, session, refreshTick]);

  useEffect(() => {
    setSelectedEntryIds((ids) => {
      const nextIds = ids.filter((id) => filteredEntryIds.has(id));
      return arraysEqual(ids, nextIds) ? ids : nextIds;
    });
    setActiveEntryId((id) => (id && filteredEntryIds.has(id) ? id : undefined));
    setLastSelectedEntryId((id) => (id && filteredEntryIds.has(id) ? id : undefined));
  }, [filteredEntryIds]);

  useEffect(() => {
    return () => {
      if (openedFile?.blobUrl) URL.revokeObjectURL(openedFile.blobUrl);
    };
  }, [openedFile?.blobUrl]);

  const selectRoot = useCallback((root: NavigationRoot) => {
    setSelectedRoot(root);
    setCurrentPath("");
    setFilterQueryState("");
    setOperationMessage(undefined);
    setOpenedFile(undefined);
    setSelectedEntryIds([]);
    setActiveEntryId(undefined);
    setLastSelectedEntryId(undefined);
  }, []);

  const selectEntry = useCallback(
    (entry: StorageEntry, mode: EntrySelectionMode = "replace") => {
      const nextIds = buildNextSelection(selectedEntryIds, entry.id, mode, entries, lastSelectedEntryId);
      setSelectedEntryIds(nextIds);
      setActiveEntryId(nextIds.includes(entry.id) ? entry.id : nextIds[0]);
      setLastSelectedEntryId(entry.id);
      setOperationMessage(undefined);
    },
    [entries, lastSelectedEntryId, selectedEntryIds]
  );

  const selectAllEntries = useCallback(() => {
    const nextIds = entries.map((entry) => entry.id);
    setSelectedEntryIds(nextIds);
    setActiveEntryId(nextIds[0]);
    setLastSelectedEntryId(nextIds.at(-1));
    setOperationMessage(undefined);
  }, [entries]);

  const setFilterQuery = useCallback((query: string) => {
    setFilterQueryState(query);
    setOperationMessage(undefined);
  }, []);

  const setSort = useCallback((field: EntrySortField) => {
    setSortField((currentField) => {
      if (currentField === field) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return currentField;
      }

      setSortDirection("asc");
      return field;
    });
  }, []);

  const requireRoot = useCallback(() => {
    if (!selectedRoot) throw new Error("No storage root selected");
    return selectedRoot;
  }, [selectedRoot]);

  const requireSelection = useCallback(() => {
    if (selectedEntries.length === 0) throw new Error("No entries selected");
    return selectedEntries;
  }, [selectedEntries]);

  const requireSingleSelected = useCallback(() => {
    if (selectedEntries.length !== 1) throw new Error("Select exactly one entry");
    return selectedEntries[0];
  }, [selectedEntries]);

  const openFile = useCallback(
    async (entry: StorageEntry, placement: OpenedFilePlacement) => {
      const root = requireRoot();
      const match = resolveFileOpener(entry, uiPlugins);
      if (!match) {
        setOpenedFile({
          entry,
          placement,
          loading: false,
          error: openerBlockedReason(entry, uiPlugins),
          viewMode: "source",
          dirty: false
        });
        return;
      }

      const viewMode = defaultViewMode(match.opener.view);
      setOpenedFile({ entry, match, placement, loading: match.opener.readStrategy !== "metadata", viewMode, dirty: false });
      setError(undefined);
      setOperationMessage(undefined);

      if (match.opener.readStrategy === "metadata") {
        setOpenedFile({ entry, match, placement, loading: false, viewMode, dirty: false });
        return;
      }

      try {
        if (match.opener.readStrategy === "bounded") {
          const preview = await cagnardApi.preview(root.tunnel, root.id, entry.path);
          setOpenedFile({
            entry,
            match,
            placement,
            loading: false,
            content: preview.content,
            editedContent: preview.content,
            viewMode,
            dirty: false
          });
          return;
        }

        const blob = await cagnardApi.download(root.tunnel, root.id, entry.path);
        const blobUrl = URL.createObjectURL(blob);
        setOpenedFile({ entry, match, placement, loading: false, blobUrl, viewMode, dirty: false });
      } catch (caught) {
        if (handleUnauthorized(caught)) return;
        setOpenedFile({
          entry,
          match,
          placement,
          loading: false,
          error: caught instanceof Error ? caught.message : String(caught),
          viewMode,
          dirty: false
        });
      }
    },
    [handleUnauthorized, requireRoot, uiPlugins]
  );

  const openEntry = useCallback(
    async (entry: StorageEntry) => {
      if (entry.kind === "directory") {
        setOpenedFile(undefined);
        setCurrentPath(entry.path);
        setFilterQueryState("");
        return;
      }

      await openFile(entry, "page");
    },
    [openFile]
  );

  const openInlineEntry = useCallback(
    async (entry: StorageEntry) => {
      if (entry.kind === "directory") {
        setOpenedFile(undefined);
        setCurrentPath(entry.path);
        setFilterQueryState("");
        return;
      }

      await openFile(entry, "inline");
    },
    [openFile]
  );

  const openSelected = useCallback(async () => {
    const entry = requireSingleSelected();
    await openEntry(entry);
  }, [openEntry, requireSingleSelected]);

  const closeOpenedFile = useCallback(() => {
    setOpenedFile(undefined);
  }, []);

  const setOpenedFileViewMode = useCallback((mode: OpenedFileViewMode) => {
    setOpenedFile((current) => (current ? { ...current, viewMode: mode } : current));
  }, []);

  const updateOpenedFileContent = useCallback((content: string) => {
    setOpenedFile((current) => (current ? { ...current, editedContent: content, dirty: content !== (current.content ?? "") } : current));
  }, []);

  const prettifyOpenedJson = useCallback(() => {
    setOpenedFile((current) => {
      if (!current) return current;
      try {
        const nextContent = `${JSON.stringify(JSON.parse(current.editedContent ?? current.content ?? ""), null, 2)}\n`;
        return { ...current, editedContent: nextContent, dirty: nextContent !== (current.content ?? ""), error: undefined, viewMode: "source" };
      } catch (caught) {
        return { ...current, error: caught instanceof Error ? caught.message : String(caught) };
      }
    });
  }, []);

  const minifyOpenedJson = useCallback(() => {
    setOpenedFile((current) => {
      if (!current) return current;
      try {
        const nextContent = JSON.stringify(JSON.parse(current.editedContent ?? current.content ?? ""));
        return { ...current, editedContent: nextContent, dirty: nextContent !== (current.content ?? ""), error: undefined, viewMode: "source" };
      } catch (caught) {
        return { ...current, error: caught instanceof Error ? caught.message : String(caught) };
      }
    });
  }, []);

  const saveOpenedFile = useCallback(async () => {
    const root = requireRoot();
    const current = openedFile;
    if (!current?.match) throw new Error("No opened file to save");
    if (!canWriteBack(current.entry, root.readOnly)) {
      setOpenedFile({ ...current, error: "This storage entry does not support write-back." });
      return;
    }

    const content = current.editedContent ?? current.content;
    if (content === undefined) return;

    try {
      const contentType = current.entry.metadata.mimeType ?? current.match.classification.mimeType ?? "text/plain";
      await cagnardApi.uploadContent(root.tunnel, root.id, current.entry.path, new Blob([content], { type: contentType }), contentType, true);
      setOpenedFile({ ...current, content, editedContent: content, dirty: false, error: undefined });
      setOperationMessage(`Saved ${current.entry.name}`);
      setRefreshTick((value) => value + 1);
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setOpenedFile({ ...current, error: caught instanceof Error ? caught.message : String(caught) });
    }
  }, [handleUnauthorized, openedFile, requireRoot]);

  const openDirectory = useCallback((entry: StorageEntry) => {
    if (entry.kind === "directory") {
      setOpenedFile(undefined);
      setCurrentPath(entry.path);
      setFilterQueryState("");
    }
  }, []);

  const navigateToPath = useCallback((path: string) => {
    setOpenedFile(undefined);
    setCurrentPath(path);
    setFilterQueryState("");
  }, []);

  const goUp = useCallback(() => {
    setOpenedFile(undefined);
    setCurrentPath((path) => {
      if (!path) return "";
      const parts = path.split("/").filter(Boolean);
      return parts.slice(0, -1).join("/");
    });
    setFilterQueryState("");
  }, []);

  const refresh = useCallback(() => setRefreshTick((value) => value + 1), []);

  const mutate = useCallback(
    async (action: () => Promise<{ message: string }>) => {
      try {
        const result = await action();
        setOperationMessage(result.message);
        setError(undefined);
        setRefreshTick((value) => value + 1);
      } catch (caught) {
        if (handleUnauthorized(caught)) return;
        const message = caught instanceof Error ? caught.message : String(caught);
        setError(message);
        setOperationMessage(undefined);
      }
    },
    [handleUnauthorized]
  );

  const login = useCallback(
    async (providerId: string, username: string, password: string) => {
      setLoginLoading(true);
      try {
        const result = await cagnardApi.login(providerId, username, password);
        setSession(result.session);
        setLoginError(undefined);
        await loadApplication();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setLoginError(message);
        resetAuthenticatedState();
      } finally {
        setLoginLoading(false);
      }
    },
    [loadApplication, resetAuthenticatedState]
  );

  const logout = useCallback(async () => {
    try {
      await cagnardApi.logout();
    } finally {
      resetAuthenticatedState();
      setLoginError(undefined);
    }
  }, [resetAuthenticatedState]);

  const askText = useCallback(
    async ({
      title,
      label,
      defaultValue,
      confirmLabel,
      placeholder
    }: {
      title: string;
      label: string;
      defaultValue?: string;
      confirmLabel: string;
      placeholder?: string;
    }) => {
      const result = await openModal({
        kind: "text",
        title,
        label,
        defaultValue,
        confirmLabel,
        placeholder,
        validate: validateEntryName
      });
      return typeof result === "string" ? result.trim() : undefined;
    },
    [openModal]
  );

  const askConfirm = useCallback(
    async ({ title, message, confirmLabel, danger = false }: { title: string; message: string; confirmLabel: string; danger?: boolean }) => {
      const result = await openModal({ kind: "confirm", title, message, confirmLabel, danger });
      return result === true;
    },
    [openModal]
  );

  const askConflictPolicy = useCallback(
    async (message: string) => {
      const result = await openModal({
        kind: "conflict",
        title: "Resolve name conflict",
        message,
        canReplace: true,
        canKeepBoth: true
      });
      return typeof result === "object" ? result : undefined;
    },
    [openModal]
  );

  const showMessage = useCallback(
    async (title: string, message: string, danger = false) => {
      await openModal({ kind: "message", title, message, danger, confirmLabel: "OK" });
    },
    [openModal]
  );

  const createFile = useCallback(async () => {
    const root = requireRoot();
    const name = await askText({ title: "New file", label: "File name", defaultValue: "untitled.txt", confirmLabel: "Create" });
    if (!name) return;
    const target = currentPath ? `${currentPath}/${name}` : name;
    await mutate(() => cagnardApi.uploadContent(root.tunnel, root.id, target, new Blob([""], { type: "text/plain" }), "text/plain", false));
  }, [askText, currentPath, mutate, requireRoot]);

  const createFolder = useCallback(async () => {
    const root = requireRoot();
    const name = await askText({ title: "New folder", label: "Folder name", confirmLabel: "Create" });
    if (!name) return;
    await mutate(() => cagnardApi.createFolder(root.tunnel, root.id, currentPath, name));
  }, [askText, currentPath, mutate, requireRoot]);

  const renameSelected = useCallback(async () => {
    const root = requireRoot();
    const entry = requireSingleSelected();
    const name = await askText({ title: "Rename", label: "New name", defaultValue: entry.name, confirmLabel: "Rename" });
    if (!name || name === entry.name) return;
    await mutate(() => cagnardApi.rename(root.tunnel, root.id, entry.path, name));
  }, [askText, mutate, requireRoot, requireSingleSelected]);

  const deleteSelected = useCallback(async () => {
    const root = requireRoot();
    const entriesToDelete = requireSelection();
    const label = entriesToDelete.length === 1 ? entriesToDelete[0].name : `${entriesToDelete.length} entries`;
    const confirmed = await askConfirm({
      title: "Delete selected entries",
      message: `Delete ${label}? This cannot be undone from Cagnard.`,
      confirmLabel: "Delete",
      danger: true
    });
    if (!confirmed) return;
    await mutate(async () => {
      for (const entry of entriesToDelete) {
        await cagnardApi.delete(root.tunnel, root.id, entry.path, true);
      }
      return { message: `Deleted ${label}` };
    });
  }, [askConfirm, mutate, requireRoot, requireSelection]);

  const addSelectionToPasteboard = useCallback((intent: PasteboardIntent) => {
    const root = requireRoot();
    if (intent === "move" && root.readOnly) {
      setError("Cannot move from a read-only storage root.");
      return;
    }
    const entriesToStage = requireSelection();
    const now = Date.now();
    const staged = entriesToStage.map((entry, index): PasteboardItem => ({
      id: `${intent}:${root.tunnel}:${root.id}:${entry.path}:${now}:${index}`,
      intent,
      selected: true,
      addedAt: now + index,
      source: {
        tunnel: root.tunnel,
        rootId: root.id,
        rootLabel: root.label,
        providerFamily: root.providerFamily,
        providerId: root.providerId,
        accountId: root.accountId,
        readOnly: root.readOnly,
        path: entry.path
      },
      entry
    }));

    setPasteboardItems((current) => {
      const stagedKeys = new Set(staged.map(pasteboardKey));
      return [...current.filter((item) => !stagedKeys.has(pasteboardKey(item))), ...staged];
    });
    setOperationMessage(`${entriesToStage.length} ${entriesToStage.length === 1 ? "entry" : "entries"} added to pasteboard`);
    setError(undefined);
  }, [requireRoot, requireSelection]);

  const copySelected = useCallback(async () => {
    addSelectionToPasteboard("copy");
  }, [addSelectionToPasteboard]);

  const moveSelected = useCallback(async () => {
    addSelectionToPasteboard("move");
  }, [addSelectionToPasteboard]);

  const removePasteboardItem = useCallback((id: string) => {
    setPasteboardItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearPasteboard = useCallback(() => {
    setPasteboardItems([]);
  }, []);

  const togglePasteboardItem = useCallback((id: string) => {
    setPasteboardItems((current) => current.map((item) => item.id === id ? { ...item, selected: !item.selected } : item));
  }, []);

  const pasteboardTransfer = useCallback(async (intent: PasteboardIntent = "copy") => {
    const root = requireRoot();
    if (root.readOnly) {
      setError("Cannot paste into a read-only storage root.");
      return;
    }
    const selectedItems = pasteboardItems.filter((item) => item.selected);
    if (selectedItems.length === 0) {
      setError("Select at least one pasteboard item to paste.");
      return;
    }
    if (intent === "move" && selectedItems.some((item) => item.source.readOnly)) {
      setError("Cannot move entries from a read-only storage root.");
      return;
    }

    const executeTransfer = (conflictPolicy: "fail" | "skip" | "keep-both" | "replace") =>
      cagnardApi.transfer({
        conflictPolicy,
        destination: { tunnel: root.tunnel, rootId: root.id, path: currentPath },
        sources: selectedItems.map((item) => ({
          intent,
          tunnel: item.source.tunnel,
          rootId: item.source.rootId,
          path: item.source.path
        }))
      });

    setPasteboardBusy(true);
    try {
      let response = await executeTransfer("fail");
      if (hasTransferConflict(response.results)) {
        const conflict = firstTransferConflict(response.results);
        const choice = await askConflictPolicy(conflict?.message ?? "A destination item already exists.");
        if (!choice) {
          setOperationMessage(undefined);
          setError("Paste cancelled.");
          return;
        }
        response = await executeTransfer(choice.policy);
      }

      const successfulMoveKeys = new Set(
        response.results
          .filter((result) => result.intent === "move" && result.status === "moved")
          .map((result) => `${result.sourceTunnel}:${result.sourceRootId}:${result.sourcePath}`)
      );
      if (successfulMoveKeys.size > 0) {
        setPasteboardItems((current) => current.filter((item) => !successfulMoveKeys.has(pasteboardSourceKey(item))));
      }

      setOperationMessage(response.message);
      setError(response.success ? undefined : transferErrorSummary(response.results));
      setRefreshTick((value) => value + 1);
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setOperationMessage(undefined);
    } finally {
      setPasteboardBusy(false);
    }
  }, [askConflictPolicy, currentPath, handleUnauthorized, pasteboardItems, requireRoot]);

  const uploadFile = useCallback(
    async (file: File) => {
      const root = requireRoot();
      const target = currentPath ? `${currentPath}/${file.name}` : file.name;
      await mutate(() => cagnardApi.upload(root.tunnel, root.id, target, file, false));
    },
    [currentPath, mutate, requireRoot]
  );

  const downloadSelected = useCallback(async () => {
    const root = requireRoot();
    const files = requireSelection().filter((entry) => entry.kind === "file");
    if (files.length === 0) {
      setError("Select at least one file to download.");
      return;
    }

    try {
      for (const entry of files) {
        const blob = await cagnardApi.download(root.tunnel, root.id, entry.path);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = entry.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }
      setOperationMessage(files.length === 1 ? `Downloaded ${files[0].name}` : `Downloaded ${files.length} files`);
      setError(undefined);
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [handleUnauthorized, requireRoot, requireSelection]);

  const effectivePath = entryResponse?.path ?? currentPath;

  return useMemo(
    () => ({
      session,
      authProviders,
      authenticated: Boolean(session),
      navigation,
      selectedRoot,
      currentPath: effectivePath,
      breadcrumbs: breadcrumbs(effectivePath),
      entries,
      totalEntryCount: sourceEntries.length,
      filterQuery,
      sortField,
      sortDirection,
      selectedEntry,
      selectedEntries,
      selectedEntryIds,
      selectionCount: selectedEntries.length,
      uiPlugins,
      openedFile,
      modal,
      pasteboardItems,
      pasteboardSelectedCount,
      pasteboardBusy,
      operationMessage,
      loginLoading,
      loginError,
      loading,
      error,
      login,
      logout,
      selectRoot,
      selectEntry,
      selectAllEntries,
      clearSelection,
      setFilterQuery,
      setSort,
      openEntry,
      openInlineEntry,
      openSelected,
      closeOpenedFile,
      setOpenedFileViewMode,
      updateOpenedFileContent,
      prettifyOpenedJson,
      minifyOpenedJson,
      saveOpenedFile,
      openDirectory,
      navigateToPath,
      goUp,
      refresh,
      createFile,
      createFolder,
      renameSelected,
      deleteSelected,
      copySelected,
      moveSelected,
      removePasteboardItem,
      clearPasteboard,
      togglePasteboardItem,
      pasteboardTransfer,
      cancelModal,
      submitModal,
      showMessage,
      uploadFile,
      downloadSelected
    }),
    [
      authProviders,
      cancelModal,
      copySelected,
      createFile,
      createFolder,
      deleteSelected,
      downloadSelected,
      effectivePath,
      entries,
      error,
      filterQuery,
      goUp,
      login,
      loginError,
      loginLoading,
      loading,
      logout,
      moveSelected,
      navigateToPath,
      navigation,
      openDirectory,
      operationMessage,
      openedFile,
      modal,
      pasteboardBusy,
      pasteboardItems,
      pasteboardSelectedCount,
      openEntry,
      openInlineEntry,
      openSelected,
      pasteboardTransfer,
      refresh,
      renameSelected,
      removePasteboardItem,
      clearSelection,
      clearPasteboard,
      selectEntry,
      selectAllEntries,
      selectRoot,
      selectedEntry,
      selectedEntries,
      selectedEntryIds,
      selectedRoot,
      setFilterQuery,
      setOpenedFileViewMode,
      submitModal,
      session,
      showMessage,
      sourceEntries.length,
      sortDirection,
      sortField,
      togglePasteboardItem,
      closeOpenedFile,
      updateOpenedFileContent,
      prettifyOpenedJson,
      minifyOpenedJson,
      saveOpenedFile,
      setSort,
      uiPlugins,
      uploadFile
    ]
  );
}

function firstRoot(navigation: NavigationResponse): NavigationRoot | undefined {
  return navigation.personal?.roots[0] ?? navigation.global?.roots[0];
}

function breadcrumbs(path: string): Array<{ label: string; path: string }> {
  const parts = path.split("/").filter(Boolean);
  return [
    { label: "/", path: "" },
    ...parts.map((part, index) => ({
      label: part,
      path: parts.slice(0, index + 1).join("/")
    }))
  ];
}

function buildNextSelection(
  existingIds: string[],
  entryId: string,
  mode: EntrySelectionMode,
  visibleEntries: StorageEntry[],
  lastSelectedEntryId?: string
): string[] {
  if (mode === "range" && lastSelectedEntryId) {
    const from = visibleEntries.findIndex((entry) => entry.id === lastSelectedEntryId);
    const to = visibleEntries.findIndex((entry) => entry.id === entryId);
    if (from >= 0 && to >= 0) {
      const [start, end] = from < to ? [from, to] : [to, from];
      return visibleEntries.slice(start, end + 1).map((entry) => entry.id);
    }
  }

  if (mode === "toggle") {
    return existingIds.includes(entryId) ? existingIds.filter((id) => id !== entryId) : [...existingIds, entryId];
  }

  return [entryId];
}

function entrySearchHaystack(entry: StorageEntry): string {
  const classification = classifyEntry(entry);
  return [
    entry.name,
    entry.path,
    entry.kind,
    classification.category,
    classification.label,
    entry.metadata.mimeType,
    entry.metadata.fileCategory,
    entry.metadata.owner,
    entry.metadata.permissions,
    entry.metadata.modifiedTime,
    entry.metadata.version,
    entry.metadata.retention,
    entry.metadata.encryption,
    ...entry.capabilities.map((capability) => `${capability.name} ${capability.status}`),
    ...Object.values(entry.providerSpecific)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function arraysEqual(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function sortEntries(entries: StorageEntry[], field: EntrySortField, direction: EntrySortDirection): StorageEntry[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...entries].sort((left, right) => {
    const missingComparison = compareMissing(left, right, field);
    if (missingComparison !== 0) return missingComparison;
    const fieldComparison = compareByField(left, right, field);
    if (fieldComparison !== 0) return fieldComparison * multiplier;
    return compareText(left.name, right.name);
  });
}

function compareMissing(left: StorageEntry, right: StorageEntry, field: EntrySortField): number {
  const leftMissing = missingValue(left, field);
  const rightMissing = missingValue(right, field);
  if (leftMissing === rightMissing) return 0;
  return leftMissing ? 1 : -1;
}

function missingValue(entry: StorageEntry, field: EntrySortField): boolean {
  switch (field) {
    case "size":
      return entry.metadata.size === undefined || entry.metadata.size === null;
    case "modifiedTime":
      return !entry.metadata.modifiedTime;
    case "mimeType":
      return !entry.metadata.mimeType;
    case "fileCategory":
      return !classifyEntry(entry).category;
    default:
      return false;
  }
}

function compareByField(left: StorageEntry, right: StorageEntry, field: EntrySortField): number {
  switch (field) {
    case "kind":
      return compareText(left.kind, right.kind);
    case "size":
      return compareNumber(left.metadata.size, right.metadata.size);
    case "modifiedTime":
      return compareTime(left.metadata.modifiedTime, right.metadata.modifiedTime);
    case "mimeType":
      return compareText(left.metadata.mimeType ?? "", right.metadata.mimeType ?? "");
    case "fileCategory":
      return compareText(classifyEntry(left).label, classifyEntry(right).label);
    case "name":
    default:
      return compareText(left.name, right.name);
  }
}

function defaultViewMode(view: OpenerView): OpenedFileViewMode {
  switch (view) {
    case "archive":
      return "archive";
    case "csv":
      return "table";
    case "json":
      return "tree";
    case "markdown":
      return "rendered";
    case "media":
      return "media";
    case "pdf":
      return "pdf";
    case "text":
    default:
      return "source";
  }
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function compareNumber(left?: number | null, right?: number | null): number {
  if (left === right) return 0;
  if (left === undefined || left === null) return 1;
  if (right === undefined || right === null) return -1;
  return left - right;
}

function compareTime(left?: string | null, right?: string | null): number {
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return new Date(left).getTime() - new Date(right).getTime();
}

function validateEntryName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Name is required.";
  if (trimmed.includes("/") || trimmed.includes("\\")) return "Name cannot contain path separators.";
  if (trimmed === "." || trimmed === "..") return "Name is not allowed.";
  return undefined;
}

function pasteboardKey(item: PasteboardItem): string {
  return `${item.intent}:${item.source.tunnel}:${item.source.rootId}:${item.source.path}`;
}

function pasteboardSourceKey(item: PasteboardItem): string {
  return `${item.source.tunnel}:${item.source.rootId}:${item.source.path}`;
}

function hasTransferConflict(results: TransferItemResult[]): boolean {
  return results.some((result) => result.status === "conflict" || hasTransferConflict(result.children ?? []));
}

function firstTransferConflict(results: TransferItemResult[]): TransferItemResult | undefined {
  for (const result of results) {
    if (result.status === "conflict") return result;
    const child = firstTransferConflict(result.children ?? []);
    if (child) return child;
  }
  return undefined;
}

function transferErrorSummary(results: TransferItemResult[]): string | undefined {
  const failures = flattenTransferResults(results).filter((result) => !["copied", "moved", "skipped"].includes(result.status));
  if (failures.length === 0) return undefined;
  return failures.slice(0, 3).map((result) => result.message).join(" ");
}

function flattenTransferResults(results: TransferItemResult[]): TransferItemResult[] {
  return results.flatMap((result) => [result, ...flattenTransferResults(result.children ?? [])]);
}
