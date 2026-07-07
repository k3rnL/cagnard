import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiRequestError, cagnardApi, isUnauthorizedError } from "./client";
import type {
  AuthProviderMetadata,
  EntryListResponse,
  NavigationResponse,
  NavigationRoot,
  SessionResponse,
  StorageEntry,
  TransferConflictPolicy,
  TransferItemResult,
  TransferJobResponse,
  UiPluginManifest
} from "./types";
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

export interface EntryPageState {
  pageSize: number;
  currentPage: number;
  hasMore: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  totalCount?: number | null;
  filteredCount?: number | null;
  searchAccuracy: string;
  sortAccuracy: string;
  totalAccuracy: string;
}

export interface BreadcrumbItem {
  label: string;
  path: string;
  navigable: boolean;
  kind: "directory" | "file";
}

interface RequestedStorageLocation {
  root: NavigationRoot;
  path: string;
  openedFilePath?: string;
}

type LocationHistoryMode = "replace" | "push" | "none";

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
  breadcrumbs: BreadcrumbItem[];
  entries: StorageEntry[];
  totalEntryCount: number;
  filteredEntryCount: number;
  entryPage: EntryPageState;
  entryPageSize: number;
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
  transferJobs: TransferJobResponse[];
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
  setEntryPageSize: (size: number) => void;
  goToNextEntryPage: () => void;
  goToPreviousEntryPage: () => void;
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
  resolveTransferJob: (jobId: string) => Promise<void>;
  cancelTransferJob: (jobId: string) => Promise<void>;
  clearTransferJobs: () => Promise<void>;
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
  const [entryPageSize, setEntryPageSizeState] = useState(100);
  const [entryPageNavigation, setEntryPageNavigation] = useState<{
    criteriaKey: string;
    currentPageRef?: string;
    history: Array<string | undefined>;
  }>({ criteriaKey: "", history: [] });
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [activeEntryId, setActiveEntryId] = useState<string>();
  const [lastSelectedEntryId, setLastSelectedEntryId] = useState<string>();
  const [uiPlugins, setUiPlugins] = useState<UiPluginManifest[]>([]);
  const [openedFile, setOpenedFile] = useState<OpenedFileState>();
  const [restoreOpenedFilePath, setRestoreOpenedFilePath] = useState<string>();
  const [modal, setModal] = useState<BrowserModalState>();
  const [pasteboardItems, setPasteboardItems] = useState<PasteboardItem[]>([]);
  const [pasteboardBusy, setPasteboardBusy] = useState(false);
  const [transferJobs, setTransferJobs] = useState<TransferJobResponse[]>([]);
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
  const transferJobsRef = useRef<TransferJobResponse[]>([]);
  const transferPollingStartedAt = useRef<number>();
  const urlRestoredRef = useRef(false);
  const locationHistoryModeRef = useRef<LocationHistoryMode>("replace");

  const pasteboardSelectedCount = useMemo(
    () => pasteboardItems.filter((item) => item.selected).length,
    [pasteboardItems]
  );
  const hasActiveTransferJobs = useMemo(
    () => transferJobs.some(isActiveTransferJob),
    [transferJobs]
  );

  const sourceEntries = useMemo(() => entryResponse?.entries ?? [], [entryResponse]);
  const debouncedFilterQuery = useDebouncedValue(filterQuery, 250);
  const entries = sourceEntries;
  const listingCriteriaKey = useMemo(
    () => [
      selectedRoot?.tunnel ?? "",
      selectedRoot?.id ?? "",
      currentPath,
      debouncedFilterQuery.trim(),
      sortField,
      sortDirection,
      entryPageSize
    ].join("\u0000"),
    [currentPath, debouncedFilterQuery, entryPageSize, selectedRoot?.id, selectedRoot?.tunnel, sortDirection, sortField]
  );
  const activePageNavigation = useMemo(
    () => entryPageNavigation.criteriaKey === listingCriteriaKey
      ? entryPageNavigation
      : { criteriaKey: listingCriteriaKey, history: [] as Array<string | undefined> },
    [entryPageNavigation, listingCriteriaKey]
  );
  const entryPageMetadata = entryResponse?.page;
  const totalEntryCount = entryPageMetadata?.totalCount ?? sourceEntries.length;
  const filteredEntryCount = entryPageMetadata?.filteredCount ?? entryPageMetadata?.totalCount ?? sourceEntries.length;
  const entryPage: EntryPageState = {
    pageSize: entryPageMetadata?.pageSize ?? entryPageSize,
    currentPage: activePageNavigation.history.length + 1,
    hasMore: Boolean(entryPageMetadata?.hasMore),
    canGoPrevious: activePageNavigation.history.length > 0,
    canGoNext: Boolean(entryPageMetadata?.nextPageRef),
    totalCount: entryPageMetadata?.totalCount,
    filteredCount: entryPageMetadata?.filteredCount,
    searchAccuracy: entryPageMetadata?.accuracy.search ?? "unknown",
    sortAccuracy: entryPageMetadata?.accuracy.sort ?? "unknown",
    totalAccuracy: entryPageMetadata?.accuracy.total ?? "unknown"
  };
  const filteredEntryIds = useMemo(() => new Set(entries.map((entry) => entry.id)), [entries]);
  const entriesById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
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

  useEffect(() => {
    transferJobsRef.current = transferJobs;
  }, [transferJobs]);

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
    urlRestoredRef.current = false;
    setSession(undefined);
    setNavigation(undefined);
    setSelectedRoot(undefined);
    setCurrentPath("");
    setEntryResponse(undefined);
    setEntryPageNavigation({ criteriaKey: "", history: [] });
    setUiPlugins([]);
    setOpenedFile(undefined);
    setRestoreOpenedFilePath(undefined);
    modalResolver.current?.(undefined);
    modalResolver.current = undefined;
    setModal(undefined);
    setPasteboardItems([]);
    setTransferJobs([]);
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

  const queueLocationHistoryPush = useCallback(() => {
    locationHistoryModeRef.current = "push";
  }, []);

  const applyStorageLocation = useCallback(
    (location: RequestedStorageLocation, historyMode: LocationHistoryMode = "none") => {
      locationHistoryModeRef.current = historyMode;
      setSelectedRoot(location.root);
      setCurrentPath(location.path);
      setFilterQueryState("");
      setEntryPageNavigation({ criteriaKey: "", history: [] });
      setOperationMessage(undefined);
      setOpenedFile(undefined);
      setRestoreOpenedFilePath(location.openedFilePath);
      clearSelection();
    },
    [clearSelection]
  );

  const refreshTransferJobs = useCallback(async () => {
    try {
      const response = await cagnardApi.transferJobs();
      const previousJobs = new Map(transferJobsRef.current.map((job) => [job.id, job]));
      const newlyTerminal = response.jobs.some((job) => isTerminalTransferJob(job) && !isTerminalTransferJob(previousJobs.get(job.id)));
      setTransferJobs(response.jobs);
      if (newlyTerminal) {
        setRefreshTick((value) => value + 1);
      }
    } catch (caught) {
      if (!handleUnauthorized(caught)) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setError(message);
      }
    }
  }, [handleUnauthorized]);

  const loadApplication = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSession, nextNavigation, plugins, jobs] = await Promise.all([
        cagnardApi.session(),
        cagnardApi.navigation(),
        cagnardApi.uiPlugins(),
        cagnardApi.transferJobs()
      ]);
      setSession(nextSession);
      setNavigation(nextNavigation);
      setUiPlugins(plugins.plugins);
      setTransferJobs(jobs.jobs);
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
    if (!session?.user.id || !hasActiveTransferJobs) {
      transferPollingStartedAt.current = undefined;
      return;
    }
    let active = true;
    let timeout: number | undefined;
    const startedAt = transferPollingStartedAt.current ?? Date.now();
    transferPollingStartedAt.current = startedAt;

    const poll = async () => {
      if (!active) return;
      await refreshTransferJobs();
      if (!active) return;
      timeout = window.setTimeout(poll, transferPollDelay(Date.now() - startedAt));
    };

    timeout = window.setTimeout(poll, 50);
    return () => {
      active = false;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [hasActiveTransferJobs, refreshTransferJobs, session?.user.id]);

  useEffect(() => {
    if (!session || !navigation || urlRestoredRef.current) return;
    const requestedLocation = requestedStorageLocation(navigation);
    urlRestoredRef.current = true;

    if (!requestedLocation) return;
    if ("error" in requestedLocation) {
      setError(requestedLocation.error);
      return;
    }

    applyStorageLocation(requestedLocation, "replace");
  }, [applyStorageLocation, navigation, session]);

  useEffect(() => {
    if (!session || !selectedRoot || !urlRestoredRef.current) return;
    const openedFilePath = openedFile?.placement === "page" ? openedFile.entry.path : restoreOpenedFilePath;
    const mode = locationHistoryModeRef.current;
    locationHistoryModeRef.current = "replace";
    if (mode === "none") return;
    writeStorageLocationURL(selectedRoot, currentPath, openedFilePath, mode);
  }, [currentPath, openedFile?.entry.path, openedFile?.placement, restoreOpenedFilePath, selectedRoot, session]);

  useEffect(() => {
    if (!session || !navigation || !urlRestoredRef.current) return;

    const handlePopState = () => {
      const requestedLocation = requestedStorageLocation(navigation);
      const fallback = firstRoot(navigation);

      if (!requestedLocation) {
        if (fallback) applyStorageLocation({ root: fallback, path: "" }, "none");
        return;
      }

      if ("error" in requestedLocation) {
        setError(requestedLocation.error);
        if (fallback) applyStorageLocation({ root: fallback, path: "" }, "none");
        return;
      }

      applyStorageLocation(requestedLocation, "none");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyStorageLocation, navigation, session]);

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
    const currentPageRef = activePageNavigation.currentPageRef;

    cagnardApi
      .entries(selectedRoot.tunnel, selectedRoot.id, currentPath, {
        pageSize: entryPageSize,
        pageRef: currentPageRef,
        query: debouncedFilterQuery,
        sortKey: sortField,
        sortDirection
      })
      .then((nextEntries) => {
        if (!active) return;
        setEntryResponse(nextEntries);
        clearSelection();
        setError(undefined);
      })
      .catch((caught: Error) => {
        if (!active) return;
        if (handleUnauthorized(caught)) return;
        if (caught instanceof ApiRequestError && caught.code === "invalid_page_ref" && currentPageRef) {
          setEntryPageNavigation({ criteriaKey: listingCriteriaKey, history: [] });
          setError("The page reference expired. Showing the first page again.");
          return;
        }
        setError(caught.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    activePageNavigation.currentPageRef,
    clearSelection,
    currentPath,
    debouncedFilterQuery,
    entryPageSize,
    handleUnauthorized,
    listingCriteriaKey,
    selectedRoot,
    session,
    refreshTick,
    sortDirection,
    sortField
  ]);

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
    queueLocationHistoryPush();
    setSelectedRoot(root);
    setCurrentPath("");
    setFilterQueryState("");
    setEntryPageNavigation({ criteriaKey: "", history: [] });
    setOperationMessage(undefined);
    setOpenedFile(undefined);
    setRestoreOpenedFilePath(undefined);
    setSelectedEntryIds([]);
    setActiveEntryId(undefined);
    setLastSelectedEntryId(undefined);
  }, [queueLocationHistoryPush]);

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

  const setEntryPageSize = useCallback((size: number) => {
    const normalized = [25, 50, 100, 250, 500].includes(size) ? size : 100;
    setEntryPageSizeState(normalized);
    setEntryPageNavigation({ criteriaKey: "", history: [] });
    setOperationMessage(undefined);
  }, []);

  const goToNextEntryPage = useCallback(() => {
    const nextPageRef = entryResponse?.page.nextPageRef;
    if (!nextPageRef) return;
    setEntryPageNavigation({
      criteriaKey: listingCriteriaKey,
      currentPageRef: nextPageRef,
      history: [...activePageNavigation.history, activePageNavigation.currentPageRef]
    });
    setOperationMessage(undefined);
  }, [activePageNavigation.currentPageRef, activePageNavigation.history, entryResponse?.page.nextPageRef, listingCriteriaKey]);

  const goToPreviousEntryPage = useCallback(() => {
    if (activePageNavigation.history.length === 0) return;
    setEntryPageNavigation({
      criteriaKey: listingCriteriaKey,
      currentPageRef: activePageNavigation.history[activePageNavigation.history.length - 1],
      history: activePageNavigation.history.slice(0, -1)
    });
    setOperationMessage(undefined);
  }, [activePageNavigation.history, listingCriteriaKey]);

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
    async (
      entry: StorageEntry,
      placement: OpenedFilePlacement,
      options: { history?: LocationHistoryMode; root?: NavigationRoot } = {}
    ) => {
      const root = options.root ?? requireRoot();
      if (placement === "page" && options.history !== "none") queueLocationHistoryPush();
      setRestoreOpenedFilePath(undefined);
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
    [handleUnauthorized, queueLocationHistoryPush, requireRoot, uiPlugins]
  );

  useEffect(() => {
    if (!session || !selectedRoot || !restoreOpenedFilePath) return;
    let active = true;
    const filePath = restoreOpenedFilePath;

    cagnardApi
      .stat(selectedRoot.tunnel, selectedRoot.id, filePath)
      .then(async (entry) => {
        if (!active) return;
        if (entry.kind === "directory") {
          setError("The URL points to a directory where a file view was expected.");
          return;
        }
        await openFile(entry, "page", { history: "none", root: selectedRoot });
      })
      .catch((caught: Error) => {
        if (!active) return;
        if (!handleUnauthorized(caught)) setError(caught.message);
      })
      .finally(() => {
        if (!active) return;
        setRestoreOpenedFilePath((current) => (current === filePath ? undefined : current));
      });

    return () => {
      active = false;
    };
  }, [handleUnauthorized, openFile, restoreOpenedFilePath, selectedRoot, session]);

  const openEntry = useCallback(
    async (entry: StorageEntry) => {
      if (entry.kind === "directory") {
        queueLocationHistoryPush();
        setOpenedFile(undefined);
        setRestoreOpenedFilePath(undefined);
        setCurrentPath(entry.path);
        setFilterQueryState("");
        return;
      }

      await openFile(entry, "page");
    },
    [openFile, queueLocationHistoryPush]
  );

  const openInlineEntry = useCallback(
    async (entry: StorageEntry) => {
      if (entry.kind === "directory") {
        queueLocationHistoryPush();
        setOpenedFile(undefined);
        setRestoreOpenedFilePath(undefined);
        setCurrentPath(entry.path);
        setFilterQueryState("");
        return;
      }

      await openFile(entry, "inline");
    },
    [openFile, queueLocationHistoryPush]
  );

  const openSelected = useCallback(async () => {
    const entry = requireSingleSelected();
    await openEntry(entry);
  }, [openEntry, requireSingleSelected]);

  const closeOpenedFile = useCallback(() => {
    queueLocationHistoryPush();
    setOpenedFile(undefined);
    setRestoreOpenedFilePath(undefined);
  }, [queueLocationHistoryPush]);

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
      queueLocationHistoryPush();
      setOpenedFile(undefined);
      setRestoreOpenedFilePath(undefined);
      setCurrentPath(entry.path);
      setFilterQueryState("");
    }
  }, [queueLocationHistoryPush]);

  const navigateToPath = useCallback((path: string) => {
    queueLocationHistoryPush();
    setOpenedFile(undefined);
    setRestoreOpenedFilePath(undefined);
    setCurrentPath(path);
    setFilterQueryState("");
  }, [queueLocationHistoryPush]);

  const goUp = useCallback(() => {
    queueLocationHistoryPush();
    setOpenedFile(undefined);
    setRestoreOpenedFilePath(undefined);
    setCurrentPath((path) => {
      if (!path) return "";
      const parts = path.split("/").filter(Boolean);
      return parts.slice(0, -1).join("/");
    });
    setFilterQueryState("");
  }, [queueLocationHistoryPush]);

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

  const resolveTransferJob = useCallback(async (jobId: string) => {
    const job = transferJobsRef.current.find((candidate) => candidate.id === jobId);
    const conflict = job ? firstTransferConflict(job.results) : undefined;
    const choice = await askConflictPolicy(conflict?.message ?? job?.message ?? "A destination item already exists.");

    try {
      const nextJob = choice
        ? await cagnardApi.resolveTransferJob(jobId, { conflictPolicy: choice.policy })
        : await cagnardApi.cancelTransferJob(jobId);
      setTransferJobs((current) => mergeTransferJobs(current, nextJob));
      setOperationMessage(nextJob.message);
      setError(failedTransferJobMessage(nextJob));
      if (isTerminalTransferJob(nextJob)) setRefreshTick((value) => value + 1);
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setOperationMessage(undefined);
    }
  }, [askConflictPolicy, handleUnauthorized]);

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

    const selectedIds = new Set(selectedItems.map((item) => item.id));

    setPasteboardBusy(true);
    try {
      let job = await cagnardApi.startTransferJob({
        conflictPolicy: "fail",
        destination: { tunnel: root.tunnel, rootId: root.id, path: currentPath },
        sources: selectedItems.map((item) => ({
          intent,
          tunnel: item.source.tunnel,
          rootId: item.source.rootId,
          path: item.source.path
        }))
      });
      setPasteboardItems((current) => current.filter((item) => !selectedIds.has(item.id)));
      setTransferJobs((current) => mergeTransferJobs(current, job));
      if (job.status === "blocked" || hasTransferConflict(job.results)) {
        const conflict = firstTransferConflict(job.results);
        const choice = await askConflictPolicy(conflict?.message ?? job.message ?? "A destination item already exists.");
        job = choice
          ? await cagnardApi.resolveTransferJob(job.id, { conflictPolicy: choice.policy })
          : await cagnardApi.cancelTransferJob(job.id);
        setTransferJobs((current) => mergeTransferJobs(current, job));
      }

      setOperationMessage(job.message);
      setError(failedTransferJobMessage(job));
      if (isTerminalTransferJob(job)) setRefreshTick((value) => value + 1);
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setOperationMessage(undefined);
    } finally {
      setPasteboardBusy(false);
    }
  }, [askConflictPolicy, currentPath, handleUnauthorized, pasteboardItems, requireRoot]);

  const cancelTransferJob = useCallback(async (jobId: string) => {
    try {
      const job = await cagnardApi.cancelTransferJob(jobId);
      setTransferJobs((current) => mergeTransferJobs(current, job));
      setOperationMessage(job.message);
      setError(undefined);
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [handleUnauthorized]);

  const clearTransferJobs = useCallback(async () => {
    try {
      const response = await cagnardApi.clearTransferJobs();
      const jobs = await cagnardApi.transferJobs();
      setTransferJobs(jobs.jobs);
      setOperationMessage(response.message);
      setError(undefined);
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [handleUnauthorized]);

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

  return useMemo(
    () => ({
      session,
      authProviders,
      authenticated: Boolean(session),
      navigation,
      selectedRoot,
      currentPath,
      breadcrumbs: breadcrumbs(currentPath, openedFile),
      entries,
      totalEntryCount,
      filteredEntryCount,
      entryPage,
      entryPageSize,
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
      transferJobs,
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
      setEntryPageSize,
      goToNextEntryPage,
      goToPreviousEntryPage,
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
      resolveTransferJob,
      cancelTransferJob,
      clearTransferJobs,
      cancelModal,
      submitModal,
      showMessage,
      uploadFile,
      downloadSelected
    }),
    [
      authProviders,
      cancelModal,
      cancelTransferJob,
      clearTransferJobs,
      copySelected,
      createFile,
      createFolder,
      deleteSelected,
      downloadSelected,
      currentPath,
      entries,
      error,
      entryPage,
      entryPageSize,
      filterQuery,
      filteredEntryCount,
      goToNextEntryPage,
      goToPreviousEntryPage,
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
      resolveTransferJob,
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
      setEntryPageSize,
      setOpenedFileViewMode,
      submitModal,
      transferJobs,
      session,
      showMessage,
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
      uploadFile,
      totalEntryCount
    ]
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debounced;
}

function firstRoot(navigation: NavigationResponse): NavigationRoot | undefined {
  return navigation.personal?.roots[0] ?? navigation.global?.roots[0];
}

function requestedStorageLocation(navigation: NavigationResponse): RequestedStorageLocation | { error: string } | undefined {
  const params = new URLSearchParams(window.location.search);
  const tunnel = params.get("tunnel");
  const rootId = params.get("rootId");
  const roots = navigationRoots(navigation);

  if (rootId) {
    const root = roots.find((candidate) => candidate.id === rootId && (!tunnel || candidate.tunnel === tunnel));
    if (!root) return { error: "The URL points to a storage root that is not available to this user." };
    const openedFilePath = normalizeBrowserPath(params.get("openedFilePath") ?? "");
    return {
      root,
      path: openedFilePath ? parentPath(openedFilePath) : normalizeBrowserPath(params.get("path") ?? ""),
      openedFilePath: openedFilePath || undefined
    };
  }

  const readableLocation = parseReadableLocationHash();
  if (!readableLocation) return undefined;

  const candidates = roots.filter((root) => {
    const tunnelMatches = !readableLocation.tunnel || root.tunnel === readableLocation.tunnel;
    return tunnelMatches && root.label === readableLocation.rootLabel;
  });

  if (candidates.length === 1) return { root: candidates[0], path: readableLocation.path };
  if (candidates.length > 1) return { error: "The URL root name is ambiguous. Select a storage root from the navigation menu." };
  return { error: "The URL points to a storage root that is not available to this user." };
}

function writeStorageLocationURL(root: NavigationRoot, path: string, openedFilePath: string | undefined, mode: Exclude<LocationHistoryMode, "none">) {
  const normalizedPath = normalizeBrowserPath(path);
  const normalizedOpenedFilePath = openedFilePath ? normalizeBrowserPath(openedFilePath) : undefined;
  const params = new URLSearchParams(window.location.search);
  params.set("tunnel", root.tunnel);
  params.set("rootId", root.id);
  if (normalizedPath) params.set("path", normalizedPath);
  else params.delete("path");
  if (normalizedOpenedFilePath) params.set("openedFilePath", normalizedOpenedFilePath);
  else params.delete("openedFilePath");

  const search = params.toString();
  const nextURL = `${window.location.pathname}${search ? `?${search}` : ""}${readableLocationHash(root, normalizedPath, normalizedOpenedFilePath)}`;
  const currentURL = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const state = {
    cagnard: true,
    tunnel: root.tunnel,
    rootId: root.id,
    path: normalizedPath,
    openedFilePath: normalizedOpenedFilePath
  };
  if (nextURL === currentURL) {
    window.history.replaceState(state, "", nextURL);
    return;
  }
  if (mode === "push") window.history.pushState(state, "", nextURL);
  else window.history.replaceState(state, "", nextURL);
}

function readableLocationHash(root: NavigationRoot, path: string, openedFilePath?: string): string {
  const displayPath = openedFilePath || path;
  const segments = [root.tunnel, root.label, ...displayPath.split("/").filter(Boolean)];
  return `#/${segments.map(encodeURIComponent).join("/")}`;
}

function parseReadableLocationHash(): { tunnel?: "personal" | "global"; rootLabel: string; path: string } | undefined {
  const value = window.location.hash.replace(/^#\/?/, "");
  if (!value) return undefined;

  const segments = value
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  if (segments.length === 0) return undefined;

  const first = segments[0];
  const tunnel = first === "personal" || first === "global" ? first : undefined;
  const rootIndex = tunnel ? 1 : 0;
  const rootLabel = segments[rootIndex];
  if (!rootLabel) return undefined;
  return { tunnel, rootLabel, path: normalizeBrowserPath(segments.slice(rootIndex + 1).join("/")) };
}

function navigationRoots(navigation: NavigationResponse): NavigationRoot[] {
  return [
    ...(navigation.personal?.roots ?? []),
    ...(navigation.global?.roots ?? [])
  ];
}

function normalizeBrowserPath(path: string): string {
  return path.split("/").filter(Boolean).join("/");
}

function parentPath(path: string): string {
  const parts = normalizeBrowserPath(path).split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

function breadcrumbs(path: string, openedFile?: OpenedFileState): BreadcrumbItem[] {
  const pageOpenedFile = openedFile?.placement === "page" ? openedFile.entry : undefined;
  const directoryPath = pageOpenedFile ? parentPath(pageOpenedFile.path) : path;
  const parts = directoryPath.split("/").filter(Boolean);
  const items: BreadcrumbItem[] = [
    { label: "/", path: "", navigable: true, kind: "directory" },
    ...parts.map((part, index) => ({
      label: part,
      path: parts.slice(0, index + 1).join("/"),
      navigable: true,
      kind: "directory" as const
    }))
  ];
  if (pageOpenedFile) {
    items.push({ label: pageOpenedFile.name, path: pageOpenedFile.path, navigable: false, kind: "file" });
  }
  return items;
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

function arraysEqual(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
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

function mergeTransferJobs(current: TransferJobResponse[], job: TransferJobResponse): TransferJobResponse[] {
  const withoutJob = current.filter((existing) => existing.id !== job.id);
  return [job, ...withoutJob].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function isActiveTransferJob(job?: TransferJobResponse): boolean {
  return Boolean(job && ["pending", "running", "queued", "canceling"].includes(job.status));
}

function isTerminalTransferJob(job?: TransferJobResponse): boolean {
  return Boolean(job && ["completed", "canceled", "error", "failed", "partial"].includes(job.status));
}

function failedTransferJobMessage(job: TransferJobResponse): string | undefined {
  if (!["error", "failed", "partial"].includes(job.status)) return undefined;
  return transferErrorSummary(job.results) ?? job.message;
}

function transferPollDelay(elapsedMs: number): number {
  if (elapsedMs < 1000) return 50;
  if (elapsedMs < 5000) return 300;
  if (elapsedMs < 30000) return 1000;
  return 2000;
}
