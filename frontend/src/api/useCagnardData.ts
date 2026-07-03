import { useCallback, useEffect, useMemo, useState } from "react";

import { cagnardApi } from "./client";
import type {
  EntryListResponse,
  NavigationResponse,
  NavigationRoot,
  SessionResponse,
  StorageEntry,
  UiPluginManifest
} from "./types";

export type EntrySelectionMode = "replace" | "toggle" | "range";
export type EntrySortField = "name" | "kind" | "size" | "modifiedTime" | "mimeType";
export type EntrySortDirection = "asc" | "desc";

export interface CagnardDataState {
  session?: SessionResponse;
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
  previewContent?: string;
  previewLoading: boolean;
  operationMessage?: string;
  loading: boolean;
  error?: string;
  selectRoot: (root: NavigationRoot) => void;
  selectEntry: (entry: StorageEntry, mode?: EntrySelectionMode) => void;
  selectAllEntries: () => void;
  clearSelection: () => void;
  setFilterQuery: (query: string) => void;
  setSort: (field: EntrySortField) => void;
  openDirectory: (entry: StorageEntry) => void;
  navigateToPath: (path: string) => void;
  goUp: () => void;
  refresh: () => void;
  createFolder: () => Promise<void>;
  renameSelected: () => Promise<void>;
  deleteSelected: () => Promise<void>;
  copySelected: () => Promise<void>;
  moveSelected: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  downloadSelected: () => Promise<void>;
}

export function useCagnardData(): CagnardDataState {
  const [session, setSession] = useState<SessionResponse>();
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
  const [previewContent, setPreviewContent] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [operationMessage, setOperationMessage] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [refreshTick, setRefreshTick] = useState(0);

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

  const clearSelection = useCallback(() => {
    setSelectedEntryIds([]);
    setActiveEntryId(undefined);
    setLastSelectedEntryId(undefined);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([cagnardApi.session(), cagnardApi.navigation(), cagnardApi.uiPlugins()])
      .then(([nextSession, nextNavigation, plugins]) => {
        if (!active) return;
        setSession(nextSession);
        setNavigation(nextNavigation);
        setUiPlugins(plugins.plugins);
        setSelectedRoot((existing) => existing ?? firstRoot(nextNavigation));
        setError(undefined);
      })
      .catch((caught: Error) => {
        if (active) setError(caught.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedRoot) return;
    let active = true;
    setLoading(true);

    cagnardApi
      .entries(selectedRoot.tunnel, selectedRoot.id, currentPath)
      .then((nextEntries) => {
        if (!active) return;
        setEntryResponse(nextEntries);
        clearSelection();
        setPreviewContent(undefined);
        setError(undefined);
      })
      .catch((caught: Error) => {
        if (active) setError(caught.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [clearSelection, selectedRoot, currentPath, refreshTick]);

  useEffect(() => {
    setSelectedEntryIds((ids) => {
      const nextIds = ids.filter((id) => filteredEntryIds.has(id));
      return arraysEqual(ids, nextIds) ? ids : nextIds;
    });
    setActiveEntryId((id) => (id && filteredEntryIds.has(id) ? id : undefined));
    setLastSelectedEntryId((id) => (id && filteredEntryIds.has(id) ? id : undefined));
  }, [filteredEntryIds]);

  useEffect(() => {
    if (!selectedRoot || !selectedEntry || selectedEntry.kind !== "file") {
      setPreviewContent(undefined);
      return;
    }

    let active = true;
    setPreviewLoading(true);
    cagnardApi
      .preview(selectedRoot.tunnel, selectedRoot.id, selectedEntry.path)
      .then((preview) => {
        if (active) setPreviewContent(preview.content);
      })
      .catch((caught: Error) => {
        if (active) setPreviewContent(`Preview unavailable: ${caught.message}`);
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedRoot, selectedEntry]);

  const selectRoot = useCallback((root: NavigationRoot) => {
    setSelectedRoot(root);
    setCurrentPath("");
    setFilterQueryState("");
    setOperationMessage(undefined);
    setPreviewContent(undefined);
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

  const openDirectory = useCallback((entry: StorageEntry) => {
    if (entry.kind === "directory") {
      setCurrentPath(entry.path);
      setFilterQueryState("");
    }
  }, []);

  const navigateToPath = useCallback((path: string) => {
    setCurrentPath(path);
    setFilterQueryState("");
  }, []);

  const goUp = useCallback(() => {
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
        const message = caught instanceof Error ? caught.message : String(caught);
        setError(message);
        setOperationMessage(undefined);
      }
    },
    []
  );

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

  const createFolder = useCallback(async () => {
    const root = requireRoot();
    const name = window.prompt("Folder name");
    if (!name) return;
    await mutate(() => cagnardApi.createFolder(root.tunnel, root.id, currentPath, name));
  }, [currentPath, mutate, requireRoot]);

  const renameSelected = useCallback(async () => {
    const root = requireRoot();
    const entry = requireSingleSelected();
    const name = window.prompt("New name", entry.name);
    if (!name || name === entry.name) return;
    await mutate(() => cagnardApi.rename(root.tunnel, root.id, entry.path, name));
  }, [mutate, requireRoot, requireSingleSelected]);

  const deleteSelected = useCallback(async () => {
    const root = requireRoot();
    const entriesToDelete = requireSelection();
    const label = entriesToDelete.length === 1 ? entriesToDelete[0].name : `${entriesToDelete.length} entries`;
    if (!window.confirm(`Delete ${label}?`)) return;
    await mutate(async () => {
      for (const entry of entriesToDelete) {
        await cagnardApi.delete(root.tunnel, root.id, entry.path, true);
      }
      return { message: `Deleted ${label}` };
    });
  }, [mutate, requireRoot, requireSelection]);

  const copySelected = useCallback(async () => {
    const root = requireRoot();
    const entriesToCopy = requireSelection();
    if (entriesToCopy.some((entry) => entry.kind !== "file")) {
      setError("Copy currently supports files only.");
      setOperationMessage(undefined);
      return;
    }

    if (entriesToCopy.length === 1) {
      const entry = entriesToCopy[0];
      const target = window.prompt("Copy to path", siblingPath(entry.path, `${entry.name}.copy`));
      if (!target) return;
      await mutate(() => cagnardApi.copy(root.tunnel, root.id, entry.path, target, false));
      return;
    }

    const targetDirectory = window.prompt("Copy selected files to folder path", currentPath);
    if (targetDirectory === null) return;
    const targetBase = normalizeDirectoryPath(targetDirectory);
    await mutate(async () => {
      for (const entry of entriesToCopy) {
        await cagnardApi.copy(root.tunnel, root.id, entry.path, joinPath(targetBase, entry.name), false);
      }
      return { message: `Copied ${entriesToCopy.length} files` };
    });
  }, [currentPath, mutate, requireRoot, requireSelection]);

  const moveSelected = useCallback(async () => {
    const root = requireRoot();
    const entriesToMove = requireSelection();
    if (entriesToMove.length === 1) {
      const entry = entriesToMove[0];
      const target = window.prompt("Move to path", entry.path);
      if (!target || target === entry.path) return;
      await mutate(() => cagnardApi.move(root.tunnel, root.id, entry.path, target, false));
      return;
    }

    const targetDirectory = window.prompt("Move selected entries to folder path", currentPath);
    if (targetDirectory === null) return;
    const targetBase = normalizeDirectoryPath(targetDirectory);
    await mutate(async () => {
      for (const entry of entriesToMove) {
        await cagnardApi.move(root.tunnel, root.id, entry.path, joinPath(targetBase, entry.name), false);
      }
      return { message: `Moved ${entriesToMove.length} entries` };
    });
  }, [currentPath, mutate, requireRoot, requireSelection]);

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
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [requireRoot, requireSelection]);

  const effectivePath = entryResponse?.path ?? currentPath;

  return useMemo(
    () => ({
      session,
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
      previewContent,
      previewLoading,
      operationMessage,
      loading,
      error,
      selectRoot,
      selectEntry,
      selectAllEntries,
      clearSelection,
      setFilterQuery,
      setSort,
      openDirectory,
      navigateToPath,
      goUp,
      refresh,
      createFolder,
      renameSelected,
      deleteSelected,
      copySelected,
      moveSelected,
      uploadFile,
      downloadSelected
    }),
    [
      copySelected,
      createFolder,
      deleteSelected,
      downloadSelected,
      effectivePath,
      entries,
      error,
      filterQuery,
      goUp,
      loading,
      moveSelected,
      navigateToPath,
      navigation,
      openDirectory,
      operationMessage,
      previewContent,
      previewLoading,
      refresh,
      renameSelected,
      clearSelection,
      selectEntry,
      selectAllEntries,
      selectRoot,
      selectedEntry,
      selectedEntries,
      selectedEntryIds,
      selectedRoot,
      setFilterQuery,
      session,
      sourceEntries.length,
      sortDirection,
      sortField,
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

function siblingPath(path: string, name: string): string {
  const parts = path.split("/").filter(Boolean);
  const parent = parts.slice(0, -1).join("/");
  return parent ? `${parent}/${name}` : name;
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
  return [
    entry.name,
    entry.path,
    entry.kind,
    entry.metadata.mimeType,
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

function joinPath(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name;
}

function normalizeDirectoryPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .join("/");
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
    case "name":
    default:
      return compareText(left.name, right.name);
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
