import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Code2,
  Download,
  ExternalLink,
  Filter,
  LoaderCircle,
  Plus,
  Play,
  RefreshCw,
  Search,
  Square,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import hljs from "highlight.js/lib/core";
import sqlLanguage from "highlight.js/lib/languages/sql";

import type { StorageEntry } from "../api/types";
import type {
  StructuredErrorShape,
  StructuredField,
  StructuredFilter,
  StructuredInspection,
  StructuredFormatId,
  StructuredDataLimits,
  StructuredPage,
  StructuredPageRequest,
  StructuredSort,
  StructuredSQLResult,
  StructuredValue,
  IcebergSnapshot,
  NetCDFSliceProjection,
  NetCDFSliceRequest,
  NetCDFDataset,
} from "./models";
import NetCDFWorkspace from "./NetCDFWorkspace";
import { defaultStructuredDataLimits, loadStructuredDataLimits } from "./config";
import {
  StructuredDataClientError,
  StructuredDataWorkerClient,
} from "./workerClient";
import {
  acquireStructuredDataRuntime,
  type StructuredRuntimeLease,
} from "./runtimeManager";

hljs.registerLanguage("sql", sqlLanguage);

export interface StructuredDataViewProps {
  entry: StorageEntry;
  format: StructuredFormatId;
  contentUrl: string;
}

export interface QueryState {
  filters?: StructuredFilter[];
  sorts?: StructuredSort[];
  projection?: string[];
}

interface FilterDraft {
  id: number;
  column: string;
  operator: StructuredFilter["operator"];
  value: string;
}

interface SortDraft {
  id: number;
  column: string;
  direction: StructuredSort["direction"];
}

type StructuredOperation = "page" | "filters" | "sorts" | "columns" | "reset" | "slice";

const structuredTabs = ["data", "sql", "snapshots", "schema", "metadata"] as const;
const maximumFilterDrafts = 8;
const maximumSortDrafts = 8;
const maximumHighlightedSQLCharacters = 64 * 1024;
type StructuredTab = (typeof structuredTabs)[number];

export default function StructuredDataView(
  { entry, format, contentUrl }: StructuredDataViewProps,
) {
  const [attempt, setAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState<StructuredTab>("data");
  const [inspection, setInspection] = useState<StructuredInspection>();
  const [page, setPage] = useState<StructuredPage>();
  const [error, setError] = useState<StructuredErrorShape>();
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState("Preparing viewer");
  const [loaded, setLoaded] = useState<number>();
  const [total, setTotal] = useState<number>();
  const [pageSize, setPageSize] = useState(50);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>(
    [],
  );
  const [activeCursor, setActiveCursor] = useState<string>();
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [filterDrafts, setFilterDrafts] = useState<FilterDraft[]>([]);
  const [sortDrafts, setSortDrafts] = useState<SortDraft[]>([]);
  const [pendingHeaderSortColumn, setPendingHeaderSortColumn] = useState<
    string
  >();
  const [queryEditor, setQueryEditor] = useState<"filter" | "sort">();
  const [delimiter, setDelimiter] = useState<"auto" | "," | "\t" | ";" | "|">(
    "auto",
  );
  const [headerMode, setHeaderMode] = useState<"first-row" | "none">(
    "first-row",
  );
  const [dataRenderMode, setDataRenderMode] = useState<"table" | "records">(
    "table",
  );
  const [query, setQuery] = useState<QueryState>({});
  const [activeOperation, setActiveOperation] = useState<StructuredOperation>();
  const [sqlText, setSQLText] = useState("SELECT *\nFROM data\nLIMIT 100");
  const [sqlResult, setSQLResult] = useState<StructuredSQLResult>();
  const [sqlError, setSQLError] = useState<StructuredErrorShape>();
  const [sqlLoading, setSQLLoading] = useState(false);
  const [sqlCursorHistory, setSQLCursorHistory] = useState<Array<string | undefined>>([]);
  const [sqlCursor, setSQLCursor] = useState<string>();
  const [icebergSnapshots, setIcebergSnapshots] = useState<IcebergSnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>();
  const [netcdfProjection, setNetCDFProjection] = useState<NetCDFSliceProjection>();
  const [limits, setLimits] = useState<StructuredDataLimits>(defaultStructuredDataLimits);
  const clientRef = useRef<StructuredDataWorkerClient>();
  const sourceIdRef = useRef("");
  const operationRef = useRef<AbortController>();
  const sqlOperationRef = useRef<AbortController>();
  const nextFilterDraftIdRef = useRef(0);
  const nextSortDraftIdRef = useRef(0);
  const tabIdPrefix = useId().replaceAll(":", "");

  const absoluteContentUrl = useMemo(
    () => new URL(contentUrl, window.location.origin).toString(),
    [contentUrl],
  );

  const loadPage = useCallback(
    async (
      cursor: string | undefined,
      nextQuery: QueryState,
      nextPageSize = pageSize,
      operation: StructuredOperation = "page",
    ) => {
      const client = clientRef.current;
      if (!client) return false;
      operationRef.current?.abort();
      const controller = new AbortController();
      operationRef.current = controller;
      setLoading(true);
      setActiveOperation(operation);
      setPhase("Reading rows");
      setLoaded(undefined);
      setTotal(undefined);
      setError(undefined);
      try {
        const request: StructuredPageRequest = {
          cursor,
          limit: nextPageSize,
          filters: nextQuery.filters,
          sorts: nextQuery.sorts,
          projection: nextQuery.projection,
        };
        const nextPage = nextQuery.filters?.length || nextQuery.sorts?.length ||
            nextQuery.projection
          ? await client.query(
            sourceIdRef.current,
            request,
            controller.signal,
          )
          : await client.page(
            sourceIdRef.current,
            request,
            controller.signal,
          );
        setPage(nextPage);
        setActiveCursor(cursor);
        setSelectedRows(new Set());
        setVisibleColumns((current) =>
          current.size > 0 ? current : new Set(nextPage.columns)
        );
        return true;
      } catch (caught) {
        if (controller.signal.aborted) return false;
        setError(errorShape(caught));
        return false;
      } finally {
        if (operationRef.current === controller) {
          setLoading(false);
          setActiveOperation(undefined);
        }
      }
    },
    [pageSize],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let lease: StructuredRuntimeLease | undefined;
    operationRef.current = controller;
    setInspection(undefined);
    setPage(undefined);
    setError(undefined);
    setLoading(true);
    setLoaded(undefined);
    setTotal(undefined);
    setCursorHistory([]);
    setActiveCursor(undefined);
    setVisibleColumns(new Set());
    setQuery({});
    setFilterDrafts([]);
    setSortDrafts([]);
    setPendingHeaderSortColumn(undefined);
    setQueryEditor(undefined);
    setActiveOperation(undefined);
    setSQLResult(undefined);
    setSQLError(undefined);
    setSQLLoading(false);
    setSQLCursorHistory([]);
    setSQLCursor(undefined);
    setIcebergSnapshots([]);
    setSelectedSnapshotId(undefined);
    setNetCDFProjection(undefined);
    sqlOperationRef.current?.abort();
    void acquireStructuredDataRuntime()
      .then(async (nextLease) => {
        lease = nextLease;
        if (!active || controller.signal.aborted) {
          await nextLease.release();
          return;
        }
        const { client, sourceId } = nextLease;
        clientRef.current = client;
        sourceIdRef.current = sourceId;
				const limits = await loadStructuredDataLimits();
				if (!active || controller.signal.aborted) return;
        setLimits(limits);
        const nextInspection = await client.initialize(
          {
            sourceId,
            format,
            name: entry.name,
            contentUrl: absoluteContentUrl,
            size: entry.metadata.size ?? undefined,
            mimeType: entry.metadata.mimeType ?? undefined,
						limits,
            options: format === "delimited-text"
              ? {
                delimiter: delimiter === "auto" ? undefined : delimiter,
                header: headerMode === "first-row",
              }
              : undefined,
          },
          controller.signal,
          (nextPhase, nextLoaded, nextTotal) => {
            if (!active) return;
            setPhase(nextPhase);
            setLoaded(nextLoaded);
            setTotal(nextTotal);
          },
        );
        if (!active || controller.signal.aborted) return;
        setInspection(nextInspection);
        if (format === "iceberg") {
          const snapshots = await client.icebergSnapshots(sourceId, controller.signal);
          if (!active || controller.signal.aborted) return;
          setIcebergSnapshots(snapshots);
          setSelectedSnapshotId(snapshots.find((snapshot) => snapshot.current)?.snapshotId);
        }
        const firstField = nextInspection.schema[0];
        nextFilterDraftIdRef.current += 1;
        setFilterDrafts([
          filterDraftFromField(firstField, nextFilterDraftIdRef.current),
        ]);
        nextSortDraftIdRef.current += 1;
        setSortDrafts([
          sortDraftFromField(firstField, nextSortDraftIdRef.current),
        ]);
        const nextPage = await client.page(
          sourceId,
          { limit: pageSize },
          controller.signal,
        );
        if (!active || controller.signal.aborted) return;
        setPage(nextPage);
        setActiveCursor(undefined);
        setVisibleColumns(new Set(nextPage.columns));
      })
      .catch((caught) => {
        if (active && !controller.signal.aborted) setError(errorShape(caught));
      })
      .finally(() => {
        if (active && !controller.signal.aborted) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
      sqlOperationRef.current?.abort();
      if (lease && clientRef.current === lease.client) {
        clientRef.current = undefined;
      }
      void lease?.release().catch(() => undefined);
    };
  }, [
    absoluteContentUrl,
    attempt,
    delimiter,
    entry.id,
    entry.metadata.mimeType,
    entry.metadata.size,
    entry.name,
    format,
    headerMode,
  ]);

  const allColumns = inspection?.schema.map((field) => field.name) ??
    page?.columns ?? [];
  const visibleTabs: readonly StructuredTab[] = structuredTabs.filter((tab) =>
    (tab !== "sql" || inspection?.capabilities.sql) &&
    (tab !== "snapshots" || format === "iceberg")
  );
  const displayedColumns =
    page?.columns.filter((column) => visibleColumns.has(column)) ?? [];
  const progress = loaded !== undefined && total
    ? Math.min(100, Math.round((loaded / total) * 100))
    : undefined;
  const preparedFilters = filterDrafts.map((draft) =>
    createStructuredFilter(
      inspection?.schema ?? [],
      draft.column,
      draft.operator,
      draft.value,
    )
  );
  const filtersReady = preparedFilters.length > 0 &&
    preparedFilters.every(isStructuredFilter);
  const sortsReady = sortDrafts.length > 0 &&
    sortDrafts.length <= maximumSortDrafts &&
    sortDrafts.every((draft) => Boolean(draft.column)) &&
    new Set(sortDrafts.map((draft) => draft.column)).size === sortDrafts.length;

  const cancelOperation = () => {
    operationRef.current?.abort();
    setLoading(false);
    setActiveOperation(undefined);
    setPhase("Canceled");
    setError(
      inspection ? undefined : {
        code: "aborted",
        message: "The operation was canceled.",
        retryable: true,
      },
    );
  };

  const runSQL = async (cursor?: string) => {
    const client = clientRef.current;
    const relation = inspection?.relation;
    if (!client || !relation) return false;
    sqlOperationRef.current?.abort();
    const controller = new AbortController();
    sqlOperationRef.current = controller;
    setSQLLoading(true);
    setSQLError(undefined);
    try {
      const result = await client.sql(sourceIdRef.current, {
        sql: sqlText,
        cursor,
        limit: pageSize,
        generation: relation.generation,
      }, controller.signal);
      setSQLResult(result);
      setSQLCursor(cursor);
      return true;
    } catch (caught) {
      if (!controller.signal.aborted) setSQLError(errorShape(caught));
      return false;
    } finally {
      if (sqlOperationRef.current === controller) setSQLLoading(false);
    }
  };

  const stopSQL = () => {
    sqlOperationRef.current?.abort();
    setSQLLoading(false);
  };

  const selectIcebergSnapshot = async (snapshotId: string | undefined) => {
    const client = clientRef.current;
    if (!client || format !== "iceberg") return;
    operationRef.current?.abort();
    const controller = new AbortController();
    operationRef.current = controller;
    setLoading(true);
    setPhase("Opening snapshot");
    setError(undefined);
    try {
      const nextInspection = await client.selectIcebergSnapshot(
        sourceIdRef.current,
        snapshotId,
        controller.signal,
      );
      const nextPage = await client.page(sourceIdRef.current, { limit: pageSize }, controller.signal);
      setInspection(nextInspection);
      setPage(nextPage);
      setSelectedSnapshotId(snapshotId ?? icebergSnapshots.find((snapshot) => snapshot.current)?.snapshotId);
      setQuery({});
      setCursorHistory([]);
      setActiveCursor(undefined);
      setVisibleColumns(new Set(nextPage.columns));
      setSQLResult(undefined);
      setSQLError(undefined);
      setSQLCursorHistory([]);
      setSQLCursor(undefined);
      setActiveTab("data");
    } catch (caught) {
      if (!controller.signal.aborted) setError(errorShape(caught));
    } finally {
      if (operationRef.current === controller) setLoading(false);
    }
  };

  const loadNetCDFSlice = async (request: NetCDFSliceRequest) => {
    const client = clientRef.current;
    if (!client || format !== "netcdf") return;
    operationRef.current?.abort();
    const controller = new AbortController();
    operationRef.current = controller;
    setLoading(true);
    setActiveOperation("slice");
    setPhase("Loading bounded NetCDF slice");
    setError(undefined);
    try {
      const result = await client.netcdfSlice(sourceIdRef.current, request, controller.signal);
      setInspection(result.inspection);
      setPage(result.page);
      setNetCDFProjection(result.projection);
      setQuery({});
      setCursorHistory([]);
      setActiveCursor(undefined);
      setSelectedRows(new Set());
      setVisibleColumns(new Set(result.page.columns));
      setSQLResult(undefined);
      setSQLError(undefined);
      setSQLCursorHistory([]);
      setSQLCursor(undefined);
    } catch (caught) {
      if (!controller.signal.aborted) setError(errorShape(caught));
    } finally {
      if (operationRef.current === controller) {
        setLoading(false);
        setActiveOperation(undefined);
      }
    }
  };

  const applyFilters = async () => {
    if (!inspection?.capabilities.exactFilter || !filtersReady) return;
    const nextQuery: QueryState = {
      ...query,
      filters: preparedFilters as StructuredFilter[],
    };
    setCursorHistory([]);
    if (await loadPage(undefined, nextQuery, pageSize, "filters")) {
      setQuery(nextQuery);
    }
  };

  const applySorts = async () => {
    if (!inspection?.capabilities.exactSort || !sortsReady) return;
    const nextQuery: QueryState = {
      ...query,
      sorts: sortDrafts.map(({ column, direction }) => ({
        column,
        direction,
      })),
    };
    setCursorHistory([]);
    if (await loadPage(undefined, nextQuery, pageSize, "sorts")) {
      setQuery(nextQuery);
    }
  };

  const applyColumns = async (nextColumns: Set<string>): Promise<boolean> => {
    const nextQuery: QueryState = {
      ...query,
      projection:
        inspection?.capabilities.exactProjection && nextColumns.size > 0 &&
          nextColumns.size < allColumns.length
          ? Array.from(nextColumns)
          : undefined,
    };
    setCursorHistory([]);
    const completed = await loadPage(undefined, nextQuery, pageSize, "columns");
    if (completed) {
      setVisibleColumns(nextColumns);
      setQuery(nextQuery);
    }
    return completed;
  };

  const applyColumnSort = async (column: string, additive: boolean) => {
    if (!inspection?.capabilities.exactSort) return;
    const currentSorts = query.sorts ?? [];
    const existing = currentSorts.find((sort) => sort.column === column);
    const direction: StructuredSort["direction"] = existing?.direction === "asc"
      ? "desc"
      : "asc";
    const nextSorts: StructuredSort[] = additive
      ? existing
        ? currentSorts.map((sort) =>
          sort.column === column ? { ...sort, direction } : sort
        )
        : currentSorts.length < maximumSortDrafts
        ? [...currentSorts, { column, direction: "asc" as const }]
        : currentSorts
      : [{ column, direction }];
    if (nextSorts === currentSorts) return;
    setSortDrafts(nextSorts.map((sort) => {
      nextSortDraftIdRef.current += 1;
      return { id: nextSortDraftIdRef.current, ...sort };
    }));
    setPendingHeaderSortColumn(column);
    const nextQuery: QueryState = { ...query, sorts: nextSorts };
    setCursorHistory([]);
    try {
      if (await loadPage(undefined, nextQuery, pageSize, "sorts")) {
        setQuery(nextQuery);
      }
    } finally {
      setPendingHeaderSortColumn(undefined);
    }
  };

  const removeFilters = async () => {
    const firstField = inspection?.schema[0];
    nextFilterDraftIdRef.current += 1;
    const nextQuery = { ...query, filters: undefined };
    setCursorHistory([]);
    if (await loadPage(undefined, nextQuery, pageSize, "reset")) {
      setFilterDrafts([
        filterDraftFromField(firstField, nextFilterDraftIdRef.current),
      ]);
      setQueryEditor(undefined);
      setQuery(nextQuery);
    }
  };

  const removeSorts = async () => {
    const firstField = inspection?.schema[0];
    const nextQuery = { ...query, sorts: undefined };
    setCursorHistory([]);
    if (await loadPage(undefined, nextQuery, pageSize, "reset")) {
      nextSortDraftIdRef.current += 1;
      setSortDrafts([
        sortDraftFromField(firstField, nextSortDraftIdRef.current),
      ]);
      setQueryEditor(undefined);
      setQuery(nextQuery);
    }
  };

  const clearQuery = async () => {
    const firstField = inspection?.schema[0];
    nextFilterDraftIdRef.current += 1;
    nextSortDraftIdRef.current += 1;
    setCursorHistory([]);
    if (await loadPage(undefined, {}, pageSize, "reset")) {
      setFilterDrafts([
        filterDraftFromField(firstField, nextFilterDraftIdRef.current),
      ]);
      setSortDrafts([
        sortDraftFromField(firstField, nextSortDraftIdRef.current),
      ]);
      setQueryEditor(undefined);
      setQuery({});
      setVisibleColumns(new Set(allColumns));
    }
  };

  const addFilterDraft = () => {
    if (filterDrafts.length >= maximumFilterDrafts) return;
    nextFilterDraftIdRef.current += 1;
    setFilterDrafts((current) => [
      ...current,
      filterDraftFromField(
        inspection?.schema[0],
        nextFilterDraftIdRef.current,
      ),
    ]);
  };

  const addSortDraft = () => {
    if (sortDrafts.length >= maximumSortDrafts) return;
    const usedColumns = new Set(sortDrafts.map((draft) => draft.column));
    const nextField = inspection?.schema.find((field) =>
      !usedColumns.has(field.name)
    );
    if (!nextField) return;
    nextSortDraftIdRef.current += 1;
    setSortDrafts((current) => [
      ...current,
      sortDraftFromField(nextField, nextSortDraftIdRef.current),
    ]);
  };

  const exportCurrentPage = (kind: "csv" | "json") => {
    if (!page) return;
    try {
      exportPage(
        kind,
        entry.name,
        page,
        displayedColumns,
        selectedRows,
        limits.exports,
      );
    } catch (caught) {
      setError(errorShape(caught));
    }
  };

  if (error && !inspection) {
    return (
      <section
        className="structured-view structured-error"
        aria-label={`${entry.name} data viewer`}
      >
        <h3>Cannot open {entry.name}</h3>
        <p>{error.message}</p>
        {error.detail
          ? (
            <details>
              <summary>Technical detail</summary>
              <pre>{error.detail}</pre>
            </details>
          )
          : null}
        <div className="structured-error-actions">
          {error.retryable
            ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                <RefreshCw size={16} /> Retry
              </button>
            )
            : null}
          <a
            className="primary-button subtle"
            href={absoluteContentUrl}
            download={entry.name}
          >
            <Download size={16} /> Download file
          </a>
        </div>
      </section>
    );
  }

  return (
    <section
      className="structured-view"
      aria-label={`${entry.name} data viewer`}
    >
      <header className="structured-header">
        <div>
          <strong>{inspection?.formatLabel ?? "Structured data"}</strong>
          <span>{inspection?.variant ?? phase}</span>
        </div>
        <a
          className="icon-button"
          href={absoluteContentUrl}
          target="_blank"
          rel="noreferrer"
          title="Open raw file"
        >
          <ExternalLink size={16} />
        </a>
      </header>

      <div
        className="structured-tabs"
        role="tablist"
        aria-label="Data file views"
      >
        {visibleTabs.map((tab) => (
          <button
            type="button"
            role="tab"
            id={`${tabIdPrefix}-tab-${tab}`}
            aria-controls={`${tabIdPrefix}-panel-${tab}`}
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "active" : undefined}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => {
              const currentIndex = visibleTabs.indexOf(tab);
              const nextIndex = event.key === "ArrowRight"
                ? (currentIndex + 1) % visibleTabs.length
                : event.key === "ArrowLeft"
                ? (currentIndex - 1 + visibleTabs.length) %
                  visibleTabs.length
                : event.key === "Home"
                ? 0
                : event.key === "End"
                ? visibleTabs.length - 1
                : undefined;
              if (nextIndex === undefined) return;
              event.preventDefault();
              const nextTab = visibleTabs[nextIndex];
              setActiveTab(nextTab);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>("[role='tab']")
                .item(nextIndex)
                .focus();
            }}
            key={tab}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading && !inspection
        ? (
          <div className="structured-loading" role="status">
            <LoaderCircle className="spin" size={20} />
            <span>
              {phase}
              {progress !== undefined ? ` (${progress}%)` : ""}
            </span>
            <button
              className="icon-button compact"
              type="button"
              title="Cancel"
              onClick={cancelOperation}
            >
              <X size={15} />
            </button>
          </div>
        )
        : null}
      {error && inspection
        ? (
          <div className="structured-inline-error" role="alert">
            <span>{error.message}</span>
            {error.detail
              ? (
                <details>
                  <summary>Technical detail</summary>
                  <pre>{error.detail}</pre>
                </details>
              )
              : null}
          </div>
        )
        : null}

      {activeTab === "data" && inspection
        ? (
          <div
            aria-labelledby={`${tabIdPrefix}-tab-data`}
            aria-busy={loading}
            className={`structured-data-tab${loading ? " is-loading" : ""}`}
            id={`${tabIdPrefix}-panel-data`}
            role="tabpanel"
          >
            {inspection.netcdf
              ? (
                <NetCDFWorkspace
                  dataset={inspection.netcdf}
                  loading={loading && activeOperation === "slice"}
                  onCancel={cancelOperation}
                  onLoad={(request) => void loadNetCDFSlice(request)}
                  projection={netcdfProjection}
                />
              )
              : null}
            <div className="structured-toolbar">
              <div className="structured-toolbar-main">
                <div className="structured-toolbar-group">
                  <label className="structured-compact-field">
                    <span>Rows</span>
                    <select
                      value={pageSize}
                      onChange={(event) => {
                        const nextSize = Number(event.target.value);
                        setPageSize(nextSize);
                        setCursorHistory([]);
                        void loadPage(undefined, query, nextSize);
                      }}
                      aria-label="Rows per page"
                    >
                      {[25, 50, 100, 250, 500].map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </label>
                  {format === "delimited-text"
                    ? (
                      <>
                        <label className="structured-compact-field">
                          <span>Delimiter</span>
                          <select
                            value={delimiter}
                            onChange={(event) =>
                              setDelimiter(
                                event.target.value as typeof delimiter,
                              )}
                            aria-label="Delimited text separator"
                          >
                            <option value="auto">Auto</option>
                            <option value=",">Comma</option>
                            <option value="\t">Tab</option>
                            <option value=";">Semicolon</option>
                            <option value="|">Pipe</option>
                          </select>
                        </label>
                        <label className="structured-compact-field">
                          <span>Header</span>
                          <select
                            value={headerMode}
                            onChange={(event) =>
                              setHeaderMode(
                                event.target.value as typeof headerMode,
                              )}
                            aria-label="Delimited text header interpretation"
                          >
                            <option value="first-row">First row</option>
                            <option value="none">No header</option>
                          </select>
                        </label>
                      </>
                    )
                    : null}
                  {format === "ndjson"
                    ? (
                      <div
                        className="structured-mode-control"
                        role="group"
                        aria-label="JSON Lines display"
                      >
                        <button
                          type="button"
                          className={dataRenderMode === "table"
                            ? "active"
                            : undefined}
                          onClick={() => setDataRenderMode("table")}
                        >
                          Table
                        </button>
                        <button
                          type="button"
                          className={dataRenderMode === "records"
                            ? "active"
                            : undefined}
                          onClick={() => setDataRenderMode("records")}
                        >
                          Records
                        </button>
                      </div>
                    )
                    : null}
                </div>

                <div className="structured-toolbar-group structured-query-triggers">
                  <ColumnsMenu
                    columns={allColumns}
                    disabled={loading}
                    running={activeOperation === "columns"}
                    selected={visibleColumns}
                    onApply={applyColumns}
                    onCancel={cancelOperation}
                  />
                  {inspection.capabilities.exactFilter
                    ? (
                      <button
                        aria-expanded={queryEditor === "filter"}
                        aria-pressed={Boolean(query.filters?.length)}
                        className="structured-tool-button"
                        type="button"
                        onClick={() =>
                          setQueryEditor((current) =>
                            current === "filter" ? undefined : "filter"
                          )}
                      >
                        <Filter size={15} />
                        <span>Filter</span>
                        {query.filters?.length
                          ? (
                            <span className="structured-tool-badge">
                              {query.filters.length}
                            </span>
                          )
                          : null}
                      </button>
                    )
                    : null}
                  {inspection.capabilities.exactSort
                    ? (
                      <button
                        aria-expanded={queryEditor === "sort"}
                        aria-pressed={Boolean(query.sorts?.length)}
                        className="structured-tool-button"
                        type="button"
                        onClick={() =>
                          setQueryEditor((current) =>
                            current === "sort" ? undefined : "sort"
                          )}
                      >
                        <ArrowUpDown size={15} />
                        <span>Sort</span>
                        {query.sorts?.length
                          ? (
                            <span className="structured-tool-badge">
                              {query.sorts.length}
                            </span>
                          )
                          : null}
                      </button>
                    )
                    : null}
                </div>

                <div
                  className="structured-export-actions"
                  aria-label="Export current page"
                >
                  <button
                    type="button"
                    className="primary-button compact subtle"
                    disabled={!inspection.capabilities.exportCurrentPage || !page?.rows.length}
                    onClick={() => exportCurrentPage("csv")}
                  >
                    <Download size={15} /> CSV
                  </button>
                  <button
                    type="button"
                    className="primary-button compact subtle"
                    disabled={!inspection.capabilities.exportCurrentPage || !page?.rows.length}
                    onClick={() => exportCurrentPage("json")}
                  >
                    <Download size={15} /> JSON
                  </button>
                </div>
              </div>

              {queryEditor === "filter"
                ? (
                  <section
                    className="structured-query-panel structured-filter-panel"
                    aria-label="Filter rows"
                  >
                    <div className="structured-query-heading">
                      <Filter size={17} />
                      <div>
                        <strong>Filter rows</strong>
                        <span>
                          All conditions match {inspection.relation?.label ?? "the complete file"}.
                        </span>
                      </div>
                    </div>
                    <div className="structured-filter-builder">
                      <div className="structured-filter-list">
                        {filterDrafts.map((draft, index) => {
                          const field = inspection.schema.find((candidate) =>
                            candidate.name === draft.column
                          );
                          const inputKind = filterInputKind(field);
                          const needsValue = draft.operator !== "is-null";
                          return (
                            <div
                              className="structured-filter-row"
                              key={draft.id}
                            >
                              <span
                                className="structured-filter-index"
                                aria-hidden="true"
                              >
                                {index + 1}
                              </span>
                              <label>
                                <span>Column</span>
                                <select
                                  value={draft.column}
                                  onChange={(event) => {
                                    const column = event.target.value;
                                    const nextField = inspection.schema.find((
                                      candidate,
                                    ) => candidate.name === column);
                                    setFilterDrafts((current) =>
                                      current.map((candidate) =>
                                        candidate.id === draft.id
                                          ? {
                                            ...candidate,
                                            column,
                                            operator: defaultFilterOperator(
                                              nextField,
                                            ),
                                            value: defaultFilterValue(
                                              nextField,
                                            ),
                                          }
                                          : candidate
                                      )
                                    );
                                  }}
                                  aria-label={`Filter ${index + 1} column`}
                                >
                                  {allColumns.map((column) => (
                                    <option key={column}>{column}</option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Condition</span>
                                <select
                                  value={draft.operator}
                                  onChange={(event) =>
                                    setFilterDrafts((current) =>
                                      current.map((candidate) =>
                                        candidate.id === draft.id
                                          ? {
                                            ...candidate,
                                            operator: event.target
                                              .value as StructuredFilter[
                                                "operator"
                                              ],
                                          }
                                          : candidate
                                      )
                                    )}
                                  aria-label={`Filter ${index + 1} operator`}
                                >
                                  {filterOperatorsForField(field).map((
                                    operator,
                                  ) => (
                                    <option key={operator} value={operator}>
                                      {filterOperatorLabel(operator)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {needsValue
                                ? (
                                  <label>
                                    <span>Value</span>
                                    {inputKind === "boolean"
                                      ? (
                                        <select
                                          value={draft.value || "true"}
                                          onChange={(event) =>
                                            setFilterDrafts((current) =>
                                              current.map((candidate) =>
                                                candidate.id === draft.id
                                                  ? {
                                                    ...candidate,
                                                    value: event.target.value,
                                                  }
                                                  : candidate
                                              )
                                            )}
                                          aria-label={`Filter ${
                                            index + 1
                                          } value`}
                                        >
                                          <option value="true">True</option>
                                          <option value="false">False</option>
                                        </select>
                                      )
                                      : (
                                        <input
                                          value={draft.value}
                                          onChange={(event) =>
                                            setFilterDrafts((current) =>
                                              current.map((candidate) =>
                                                candidate.id === draft.id
                                                  ? {
                                                    ...candidate,
                                                    value: event.target.value,
                                                  }
                                                  : candidate
                                              )
                                            )}
                                          placeholder={inputKind === "number"
                                            ? "0"
                                            : "Enter a value"}
                                          type={inputKind === "number"
                                            ? "number"
                                            : "text"}
                                          aria-label={`Filter ${
                                            index + 1
                                          } value`}
                                        />
                                      )}
                                  </label>
                                )
                                : (
                                  <div className="structured-filter-no-value">
                                    <span>Value</span>
                                    <strong>No value required</strong>
                                  </div>
                                )}
                              <button
                                className="icon-button compact"
                                type="button"
                                onClick={() =>
                                  setFilterDrafts((current) =>
                                    current.filter((candidate) =>
                                      candidate.id !== draft.id
                                    )
                                  )}
                                title={`Remove filter ${index + 1}`}
                              >
                                <X size={15} />
                              </button>
                            </div>
                          );
                        })}
                        {filterDrafts.length === 0
                          ? (
                            <p className="structured-filter-empty">
                              No filter conditions.
                            </p>
                          )
                          : null}
                      </div>
                      <button
                        className="primary-button compact subtle structured-add-filter"
                        type="button"
                        disabled={filterDrafts.length >= maximumFilterDrafts ||
                          loading}
                        onClick={addFilterDraft}
                      >
                        <Plus size={15} /> Add filter
                      </button>
                    </div>
                    <div className="structured-query-actions">
                      <button
                        className="primary-button compact subtle"
                        type="button"
                        disabled={!query.filters?.length || loading}
                        onClick={() => void removeFilters()}
                      >
                        Clear filters
                      </button>
                      <button
                        className="primary-button compact subtle"
                        type="button"
                        disabled={!query.filters?.length &&
                          !query.sorts?.length &&
                          visibleColumns.size === allColumns.length}
                        onClick={() => void clearQuery()}
                      >
                        Reset all
                      </button>
                      <AsyncApplyButton
                        disabled={!filtersReady ||
                          (loading && activeOperation !== "filters")}
                        label="Apply filters"
                        running={activeOperation === "filters"}
                        runningLabel="Applying filters"
                        stopLabel="Stop applying filters"
                        onApply={() => void applyFilters()}
                        onCancel={cancelOperation}
                      />
                    </div>
                  </section>
                )
                : null}

              {queryEditor === "sort"
                ? (
                  <section
                    className="structured-query-panel structured-sort-panel"
                    aria-label="Sort rows"
                  >
                    <div className="structured-query-heading">
                      <ArrowUpDown size={17} />
                      <div>
                        <strong>Sort rows</strong>
                        <span>
                          Keys apply in priority order to the complete file.
                        </span>
                      </div>
                    </div>
                    <div className="structured-sort-builder">
                      <div className="structured-sort-list">
                        {sortDrafts.map((draft, index) => (
                          <div className="structured-sort-row" key={draft.id}>
                            <span
                              className="structured-sort-index"
                              aria-label={`Sort priority ${index + 1}`}
                            >
                              {index + 1}
                            </span>
                            <label>
                              <span>Column</span>
                              <select
                                value={draft.column}
                                onChange={(event) => {
                                  const column = event.target.value;
                                  setSortDrafts((current) =>
                                    current.map((candidate) =>
                                      candidate.id === draft.id
                                        ? { ...candidate, column }
                                        : candidate
                                    )
                                  );
                                }}
                                aria-label={`Sort ${index + 1} column`}
                              >
                                {allColumns.map((column) => (
                                  <option
                                    disabled={sortDrafts.some((candidate) =>
                                      candidate.id !== draft.id &&
                                      candidate.column === column
                                    )}
                                    key={column}
                                  >
                                    {column}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Direction</span>
                              <select
                                value={draft.direction}
                                onChange={(event) =>
                                  setSortDrafts((current) =>
                                    current.map((candidate) =>
                                      candidate.id === draft.id
                                        ? {
                                          ...candidate,
                                          direction: event.target
                                            .value as StructuredSort[
                                              "direction"
                                            ],
                                        }
                                        : candidate
                                    )
                                  )}
                                aria-label={`Sort ${index + 1} direction`}
                              >
                                <option value="asc">Ascending</option>
                                <option value="desc">Descending</option>
                              </select>
                            </label>
                            <button
                              className="icon-button compact"
                              type="button"
                              onClick={() =>
                                setSortDrafts((current) =>
                                  current.filter((candidate) =>
                                    candidate.id !== draft.id
                                  )
                                )}
                              title={`Remove sort ${index + 1}`}
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ))}
                        {sortDrafts.length === 0
                          ? (
                            <p className="structured-filter-empty">
                              No sort keys.
                            </p>
                          )
                          : null}
                      </div>
                      <button
                        className="primary-button compact subtle structured-add-sort"
                        type="button"
                        disabled={sortDrafts.length >= maximumSortDrafts ||
                          sortDrafts.length >= allColumns.length || loading}
                        onClick={addSortDraft}
                      >
                        <Plus size={15} /> Add sort
                      </button>
                    </div>
                    <div className="structured-query-actions">
                      <button
                        className="primary-button compact subtle"
                        type="button"
                        disabled={!query.sorts?.length || loading}
                        onClick={() => void removeSorts()}
                      >
                        Clear sorts
                      </button>
                      <button
                        className="primary-button compact subtle"
                        type="button"
                        disabled={!query.filters?.length &&
                          !query.sorts?.length &&
                          visibleColumns.size === allColumns.length}
                        onClick={() => void clearQuery()}
                      >
                        Reset all
                      </button>
                      <AsyncApplyButton
                        disabled={!sortsReady ||
                          (loading && activeOperation !== "sorts")}
                        label="Apply sorts"
                        running={activeOperation === "sorts" &&
                          queryEditor === "sort"}
                        runningLabel="Applying sorts"
                        stopLabel="Stop applying sorts"
                        onApply={() => void applySorts()}
                        onCancel={cancelOperation}
                      />
                    </div>
                  </section>
                )
                : null}
            </div>

            {page?.issues.length
              ? (
                <div className="structured-issues" role="alert">
                  {page.issues.map((issue, index) => (
                    <div key={`${issue.byteOffset}-${index}`}>
                      {issue.message}
                      {issue.line !== undefined ? ` on line ${issue.line}` : ""}
                      {issue.byteOffset !== undefined
                        ? ` at byte ${issue.byteOffset}`
                        : ""}
                    </div>
                  ))}
                </div>
              )
              : null}
            {format === "ndjson" && dataRenderMode === "records"
              ? (
                <ol
                  className="structured-records"
                  start={(page?.offset ?? 0) + 1}
                >
                  {page?.rows.map((row, rowIndex) => (
                    <li key={`${page.offset}-${rowIndex}`}>
                      <span className="structured-record-number">
                        {page.offset + rowIndex + 1}
                      </span>
                      <input
                        type="checkbox"
                        aria-label={`Select record ${rowIndex + 1}`}
                        checked={selectedRows.has(rowIndex)}
                        onChange={() =>
                          setSelectedRows((current) =>
                            toggleSet(current, rowIndex)
                          )}
                      />
                      <pre>{JSON.stringify(row, null, 2)}</pre>
                    </li>
                  ))}
                  {!page?.rows.length && !loading
                    ? (
                      <li className="structured-empty">
                        No records on this page.
                      </li>
                    )
                    : null}
                </ol>
              )
              : (
                <div className="structured-grid-scroll">
                  <table className="structured-grid">
                    <thead>
                      <tr>
                        <th className="structured-select-cell">
                          <span className="visually-hidden">Select row</span>
                        </th>
                        {displayedColumns.map((column) => {
                          const activeSortIndex =
                            query.sorts?.findIndex((sort) =>
                              sort.column === column
                            ) ?? -1;
                          const activeSort = activeSortIndex >= 0
                            ? query.sorts?.[activeSortIndex]
                            : undefined;
                          return (
                            <th
                              key={column}
                              scope="col"
                              aria-sort={activeSort
                                ? (activeSort.direction === "asc"
                                  ? "ascending"
                                  : "descending")
                                : "none"}
                            >
                              {inspection.capabilities.exactSort
                                ? (
                                  <button
                                    className={activeSort
                                      ? "structured-column-sort active"
                                      : "structured-column-sort"}
                                    type="button"
                                    onClick={(event) =>
                                      void applyColumnSort(
                                        column,
                                        event.shiftKey,
                                      )}
                                    disabled={loading}
                                    title={`Sort by ${column}`}
                                  >
                                    <span>{column}</span>
                                    {activeSort
                                      ? (
                                        <span
                                          className="structured-sort-priority"
                                          aria-label={`Sort priority ${
                                            activeSortIndex + 1
                                          }`}
                                        >
                                          {activeSortIndex + 1}
                                        </span>
                                      )
                                      : null}
                                    {activeOperation === "sorts" &&
                                        pendingHeaderSortColumn === column
                                      ? (
                                        <LoaderCircle
                                          className="spin"
                                          size={14}
                                        />
                                      )
                                      : activeSort?.direction === "asc"
                                      ? <ArrowUp size={14} />
                                      : activeSort?.direction === "desc"
                                      ? <ArrowDown size={14} />
                                      : <ArrowUpDown size={14} />}
                                  </button>
                                )
                                : column}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {page?.rows.map((row, rowIndex) => (
                        <tr key={`${page.offset}-${rowIndex}`}>
                          <td className="structured-select-cell">
                            <input
                              type="checkbox"
                              aria-label={`Select row ${rowIndex + 1}`}
                              checked={selectedRows.has(rowIndex)}
                              onChange={() =>
                                setSelectedRows((current) =>
                                  toggleSet(current, rowIndex)
                                )}
                            />
                          </td>
                          {displayedColumns.map((column) => (
                            <td key={column}>
                              <StructuredCell value={row[column]} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!page?.rows.length && !loading
                    ? <p className="structured-empty">No rows on this page.</p>
                    : null}
                </div>
              )}
            <footer className="structured-pagination">
              <span className="structured-pagination-status">
                {loading &&
                    (activeOperation === "page" || activeOperation === "reset")
                  ? (
                    <>
                      <LoaderCircle className="spin" size={14} /> Reading rows
                    </>
                  )
                  : (
                    <>
                      {page
                        ? (page.rows.length > 0
                          ? `${page.offset + 1}-${
                            page.offset + page.rows.length
                          }`
                          : "0 rows")
                        : "0 rows"}
                      {page?.totalRows !== undefined
                        ? ` of ${page.totalRows}`
                        : page?.partial
                        ? " (partial result)"
                        : ""}
                    </>
                  )}
              </span>
              <div>
                <button
                  className="icon-button"
                  type="button"
                  title="Previous page"
                  disabled={cursorHistory.length === 0 || loading}
                  onClick={() => {
                    const previous = cursorHistory.at(-1);
                    setCursorHistory((current) => current.slice(0, -1));
                    void loadPage(previous, query);
                  }}
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title="Next page"
                  disabled={!page?.nextCursor || loading}
                  onClick={() => {
                    setCursorHistory((current) => [...current, activeCursor]);
                    void loadPage(page?.nextCursor, query);
                  }}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </footer>
          </div>
        )
        : null}

      {activeTab === "snapshots" && inspection
        ? (
          <div
            aria-labelledby={`${tabIdPrefix}-tab-snapshots`}
            className="structured-snapshots"
            id={`${tabIdPrefix}-panel-snapshots`}
            role="tabpanel"
          >
            <div className="structured-snapshots-heading">
              <div>
                <strong>Table history</strong>
                <span>Selecting a snapshot deliberately rebinds Data and SQL.</span>
              </div>
              <button
                className="primary-button compact subtle"
                disabled={loading || icebergSnapshots.some((snapshot) => snapshot.current && snapshot.snapshotId === selectedSnapshotId)}
                onClick={() => void selectIcebergSnapshot(undefined)}
                type="button"
              >
                Current snapshot
              </button>
            </div>
            <div className="structured-snapshot-list">
              {icebergSnapshots.map((snapshot) => {
                const selected = snapshot.snapshotId === selectedSnapshotId;
                return (
                  <article className={selected ? "selected" : undefined} key={snapshot.snapshotId}>
                    <div className="structured-snapshot-main">
                      <strong>{snapshot.operation ?? "Snapshot"}</strong>
                      <code>{snapshot.snapshotId}</code>
                      {snapshot.current ? <span className="structured-count-badge">Current</span> : null}
                    </div>
                    <dl>
                      <div><dt>Committed</dt><dd>{snapshot.committedAt ? new Date(snapshot.committedAt).toLocaleString() : "Unknown"}</dd></div>
                      <div><dt>Sequence</dt><dd>{snapshot.sequenceNumber ?? "Unknown"}</dd></div>
                      <div><dt>Parent</dt><dd>{snapshot.parentSnapshotId ?? "None"}</dd></div>
                    </dl>
                    {Object.keys(snapshot.summary).length > 0
                      ? <p>{Object.entries(snapshot.summary).map(([key, value]) => `${key}: ${value}`).join(" · ")}</p>
                      : null}
                    <button
                      className="primary-button compact subtle"
                      disabled={selected || loading}
                      onClick={() => void selectIcebergSnapshot(snapshot.snapshotId)}
                      type="button"
                    >
                      {selected ? "Selected" : "Open snapshot"}
                    </button>
                  </article>
                );
              })}
              {icebergSnapshots.length === 0
                ? <div className="structured-sql-empty">No snapshot history is present in this metadata version.</div>
                : null}
            </div>
          </div>
        )
        : null}
      {activeTab === "schema" && inspection
        ? (
          <div
            aria-labelledby={`${tabIdPrefix}-tab-schema`}
            className="structured-panel"
            id={`${tabIdPrefix}-panel-schema`}
            role="tabpanel"
          >
            {inspection.netcdf
              ? <NetCDFSchemaView dataset={inspection.netcdf} />
              : <SchemaTree fields={inspection.schema} />}
          </div>
        )
        : null}
      {activeTab === "sql" && inspection?.relation
        ? (
          <SQLWorkspace
            error={sqlError}
            loading={sqlLoading}
            onInsertCurrentView={() => {
              setSQLText(insertCurrentViewSQL(query, allColumns));
              setSQLError(undefined);
            }}
            onNext={() => {
              if (!sqlResult?.page.nextCursor) return;
              setSQLCursorHistory((current) => [...current, sqlCursor]);
              void runSQL(sqlResult.page.nextCursor);
            }}
            onPrevious={() => {
              const previous = sqlCursorHistory.at(-1);
              setSQLCursorHistory((current) => current.slice(0, -1));
              void runSQL(previous);
            }}
            onRun={() => {
              setSQLCursorHistory([]);
              void runSQL(undefined);
            }}
            onStop={stopSQL}
            result={sqlResult}
            scope={inspection.relation}
            sql={sqlText}
            setSQL={setSQLText}
            tabIdPrefix={tabIdPrefix}
            canPrevious={sqlCursorHistory.length > 0}
          />
        )
        : null}
      {activeTab === "metadata" && inspection
        ? (
          <div
            aria-labelledby={`${tabIdPrefix}-tab-metadata`}
            className="structured-panel"
            id={`${tabIdPrefix}-panel-metadata`}
            role="tabpanel"
          >
            {inspection.netcdf
              ? <NetCDFMetadataView inspection={inspection} />
              : <MetadataView inspection={inspection} />}
          </div>
        )
        : null}
    </section>
  );
}

function SQLWorkspace({
  sql,
  setSQL,
  scope,
  result,
  error,
  loading,
  canPrevious,
  tabIdPrefix,
  onRun,
  onStop,
  onInsertCurrentView,
  onPrevious,
  onNext,
}: {
  sql: string;
  setSQL: (sql: string) => void;
  scope: NonNullable<StructuredInspection["relation"]>;
  result?: StructuredSQLResult;
  error?: StructuredErrorShape;
  loading: boolean;
  canPrevious: boolean;
  tabIdPrefix: string;
  onRun: () => void;
  onStop: () => void;
  onInsertCurrentView: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const page = result?.page;
  return (
    <div
      aria-labelledby={`${tabIdPrefix}-tab-sql`}
      className="structured-sql-tab"
      id={`${tabIdPrefix}-panel-sql`}
      role="tabpanel"
    >
      <section className="structured-sql-editor" aria-label="SQL query editor">
        <div className="structured-sql-heading">
          <div>
            <strong><Code2 size={17} /> SQL workspace</strong>
            <span>
              Read-only scope: <code>data</code> · {scope.label}
              {scope.rowCount !== undefined ? ` · ${scope.rowCount.toLocaleString()} rows` : ""}
            </span>
          </div>
          <button
            className="primary-button compact subtle"
            disabled={loading}
            onClick={onInsertCurrentView}
            type="button"
          >
            Insert current view
          </button>
        </div>
        <SQLCodeEditor sql={sql} setSQL={setSQL} />
        <div className="structured-sql-actions">
          <span>{scope.description}</span>
          <button
            aria-label={loading ? "Stop SQL query" : "Run SQL query"}
            className={`primary-button compact structured-sql-run${loading ? " running" : ""}`}
            disabled={!loading && !sql.trim()}
            onClick={loading ? onStop : onRun}
            type="button"
          >
            {loading
              ? (
                <span className="structured-sql-running-icons">
                  <LoaderCircle className="spin structured-sql-spinner" size={15} />
                  <Square className="structured-sql-stop" size={14} />
                </span>
              )
              : <Play size={15} />}
            <span>{loading ? "Running" : "Run query"}</span>
          </button>
        </div>
      </section>

      {error
        ? <div className="structured-inline-error" role="alert">{error.message}</div>
        : null}
      {page
        ? (
          <section className="structured-sql-results" aria-label="SQL results">
            <div className="structured-grid-scroll">
              <table className="structured-grid">
                <thead>
                  <tr>
                    {page.columns.map((column) => <th key={column} scope="col">{column}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row, rowIndex) => (
                    <tr key={`${page.offset}-${rowIndex}`}>
                      {page.columns.map((column) => (
                        <td key={column}><StructuredCell value={row[column]} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!page.rows.length ? <p className="structured-empty">The query returned no rows.</p> : null}
            </div>
            <footer className="structured-pagination">
              <span className="structured-pagination-status">
                {page.rows.length
                  ? `${page.offset + 1}-${page.offset + page.rows.length}${page.totalRows !== undefined ? ` of ${page.totalRows}` : ""}`
                  : "0 rows"}
                {result ? ` · ${result.elapsedMilliseconds} ms` : ""}
              </span>
              <div>
                <button className="icon-button" disabled={!canPrevious || loading} onClick={onPrevious} title="Previous result page" type="button">
                  <ChevronLeft size={17} />
                </button>
                <button className="icon-button" disabled={!page.nextCursor || loading} onClick={onNext} title="Next result page" type="button">
                  <ChevronRight size={17} />
                </button>
              </div>
            </footer>
          </section>
        )
        : (
          <div className="structured-sql-empty">
            <Code2 size={22} />
            <span>Run a query to inspect results from the current data scope.</span>
          </div>
        )}
    </div>
  );
}

export function SQLCodeEditor({ sql, setSQL }: { sql: string; setSQL: (sql: string) => void }) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const mirroredSQL = sql.length === 0 ? " " : sql.endsWith("\n") ? `${sql} ` : sql;
  const highlighted = useMemo(() => highlightSQLSyntax(mirroredSQL), [mirroredSQL]);

  return (
    <div className="structured-sql-input">
      <pre aria-hidden="true" className="structured-sql-highlight" ref={highlightRef}>
        {highlighted === undefined
          ? <code>{mirroredSQL}</code>
          : <code dangerouslySetInnerHTML={{ __html: highlighted }} />}
      </pre>
      <textarea
        aria-label="SQL query"
        onChange={(event) => setSQL(event.target.value)}
        onScroll={(event) => {
          if (!highlightRef.current) return;
          highlightRef.current.scrollTop = event.currentTarget.scrollTop;
          highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
        spellCheck={false}
        value={sql}
      />
    </div>
  );
}

export function highlightSQLSyntax(sql: string): string | undefined {
  if (sql.length > maximumHighlightedSQLCharacters) return undefined;
  // Highlight.js escapes SQL before adding token spans.
  return hljs.highlight(sql, { language: "sql", ignoreIllegals: true }).value;
}

function ColumnsMenu({
  columns,
  selected,
  disabled,
  running,
  onApply,
  onCancel,
}: {
  columns: string[];
  selected: Set<string>;
  disabled: boolean;
  running: boolean;
  onApply: (columns: Set<string>) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId().replaceAll(":", "");
  const visibleOptions = columns.filter((column) =>
    column.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  );

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node && rootRef.current?.contains(event.target)
      ) return;
      close();
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [close, open]);

  return (
    <div className="structured-columns-control" ref={rootRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className={`structured-tool-button${open ? " active" : ""}`}
        disabled={disabled || columns.length === 0}
        type="button"
        onClick={() => {
          if (!open) {
            setDraft(new Set(selected));
            setSearch("");
          }
          setOpen((current) => !current);
        }}
      >
        <Columns3 size={15} />
        <span>Columns</span>
        <span className="structured-tool-badge">
          {selected.size}/{columns.length}
        </span>
        <ChevronDown size={14} />
      </button>
      {open
        ? (
          <section
            className="structured-columns-popover"
            id={panelId}
            role="dialog"
            aria-label="Choose visible columns"
          >
            <header>
              <div>
                <strong>Visible columns</strong>
                <span>{draft.size} of {columns.length} selected</span>
              </div>
              <button
                className="icon-button compact"
                type="button"
                onClick={close}
                title="Close columns"
              >
                <X size={15} />
              </button>
            </header>
            <label className="structured-column-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a column"
                type="search"
              />
            </label>
            <div className="structured-column-shortcuts">
              <button
                className="primary-button compact subtle"
                type="button"
                onClick={() => setDraft(new Set(columns))}
              >
                Select all
              </button>
              <button
                className="primary-button compact subtle"
                type="button"
                onClick={() => setDraft(new Set())}
              >
                Clear
              </button>
            </div>
            <div className="structured-column-options">
              {visibleOptions.map((column) => (
                <label key={column}>
                  <input
                    type="checkbox"
                    checked={draft.has(column)}
                    onChange={() =>
                      setDraft((current) => toggleSet(current, column))}
                  />
                  <span>{column}</span>
                </label>
              ))}
              {visibleOptions.length === 0
                ? <p>No columns match this search.</p>
                : null}
            </div>
            {draft.size === 0
              ? (
                <p className="structured-column-requirement">
                  Select at least one column.
                </p>
              )
              : null}
            <footer>
              <button
                className="primary-button compact subtle"
                type="button"
                onClick={close}
              >
                Cancel
              </button>
              <AsyncApplyButton
                disabled={draft.size === 0 || (disabled && !running)}
                label="Apply columns"
                running={running}
                runningLabel="Applying columns"
                stopLabel="Stop applying columns"
                onApply={() =>
                  void onApply(new Set(draft)).then((completed) => {
                    if (completed) close();
                  })}
                onCancel={onCancel}
              />
            </footer>
          </section>
        )
        : null}
    </div>
  );
}

export function AsyncApplyButton({
  disabled,
  label,
  running,
  runningLabel,
  stopLabel,
  onApply,
  onCancel,
}: {
  disabled: boolean;
  label: string;
  running: boolean;
  runningLabel: string;
  stopLabel: string;
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <button
      aria-label={running ? stopLabel : label}
      className={`primary-button compact structured-apply-button${
        running ? " running" : ""
      }`}
      type="button"
      disabled={!running && disabled}
      onClick={running ? onCancel : onApply}
      title={running ? stopLabel : undefined}
    >
      {running
        ? (
          <span className="structured-running-icon" aria-hidden="true">
            <LoaderCircle className="spin structured-spinner-icon" size={15} />
            <Square className="structured-stop-icon" size={14} />
          </span>
        )
        : <Check size={15} />}
      <span>{running ? runningLabel : label}</span>
    </button>
  );
}

function StructuredCell({ value }: { value: StructuredValue | undefined }) {
  if (value === null || value === undefined) {
    return <span className="structured-null">NULL</span>;
  }
  if (typeof value !== "object") {
    return <span title={String(value)}>{String(value)}</span>;
  }
  if (!Array.isArray(value) && "kind" in value && value.kind === "binary") {
    const binary = value as {
      kind: "binary";
      byteLength: number;
      preview: string;
      truncated: boolean;
    };
    return (
      <span className="structured-binary" title={`${binary.byteLength} bytes`}>
        {binary.preview}
        {binary.truncated ? " …" : ""}
      </span>
    );
  }
  const label = Array.isArray(value)
    ? `List (${value.length})`
    : `Object (${Object.keys(value).length})`;
  return (
    <details className="structured-nested-value">
      <summary>{label}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function SchemaTree({ fields }: { fields: StructuredField[] }) {
  return (
    <div className="structured-schema" role="tree" aria-label="File schema">
      {fields.map((field) => (
        <SchemaFieldNode field={field} depth={0} key={field.name} />
      ))}
    </div>
  );
}

function NetCDFSchemaView({ dataset }: { dataset: NetCDFDataset }) {
  return (
    <div className="netcdf-schema" aria-label="NetCDF schema hierarchy">
      {dataset.groups.map((group) => (
        <section key={group.path}>
          <header>
            <div>
              <strong>{group.path === "/" ? "Root group" : group.name}</strong>
              <span>{group.path}</span>
            </div>
            <span>{group.dimensions.length} dimensions · {group.variables.length} variables</span>
          </header>
          <div className="netcdf-schema-dimensions">
            {group.dimensions.map((path) => {
              const dimension = dataset.dimensions.find((candidate) => candidate.path === path);
              if (!dimension) return null;
              return (
                <div key={path}>
                  <strong>{dimension.name}</strong>
                  <span>{dimension.size.toLocaleString()} values{dimension.unlimited ? " · unlimited" : ""}</span>
                  <small>{dimension.coordinateVariablePath ? `Coordinate: ${dimension.coordinateVariablePath}` : "Index coordinate"}</small>
                </div>
              );
            })}
          </div>
          <div className="netcdf-schema-variables">
            {group.variables.map((path) => {
              const variable = dataset.variables.find((candidate) => candidate.path === path);
              if (!variable) return null;
              return (
                <div key={path}>
                  <div>
                    <strong>{variable.name}</strong>
                    <span>{variable.physicalType} · {variable.shape.join(" x ") || "scalar"}</span>
                  </div>
                  <span>{variable.dimensions.join(" x ") || "No dimensions"}</span>
                  <small>{variable.chunked ? `Chunks ${variable.chunks?.join(" x ") ?? "unknown"}` : "Contiguous"} · {variable.role}</small>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function SchemaFieldNode(
  { field, depth }: { field: StructuredField; depth: number },
) {
  return (
    <div
      className="structured-schema-node"
      role="treeitem"
      aria-level={depth + 1}
    >
      <div style={{ paddingInlineStart: `${depth * 18}px` }}>
        <strong>{field.name}</strong>
        <span>
          {field.physicalType}
          {field.logicalType && field.logicalType !== field.physicalType
            ? ` / ${field.logicalType}`
            : ""}
        </span>
        <small>{field.nullable ? "nullable" : "required"}</small>
      </div>
      {field.metadata
        ? (
          <small className="structured-field-metadata">
            {Object.entries(field.metadata).map(([key, value]) =>
              `${key}: ${value}`
            ).join(" · ")}
          </small>
        )
        : null}
      {field.children?.map((child) => (
        <SchemaFieldNode
          field={child}
          depth={depth + 1}
          key={`${field.name}.${child.name}`}
        />
      ))}
    </div>
  );
}

function MetadataView({ inspection }: { inspection: StructuredInspection }) {
  return (
    <div className="structured-metadata">
      {inspection.warnings.map((warning) => (
        <div className="structured-warning" key={warning}>{warning}</div>
      ))}
      {inspection.metadata.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <dl>
            {section.values.map(({ label, value }, index) => (
              <div key={`${label}-${index}`}>
                <dt>{label}</dt>
                <dd>
                  <StructuredCell value={value} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function NetCDFMetadataView({ inspection }: { inspection: StructuredInspection }) {
  const dataset = inspection.netcdf;
  if (!dataset) return <MetadataView inspection={inspection} />;
  return (
    <div className="structured-metadata netcdf-metadata">
      {inspection.warnings.map((warning) => (
        <div className="structured-warning" key={warning}>{warning}</div>
      ))}
      {inspection.metadata.map((section) => (
        <MetadataSection key={section.title} title={section.title} values={section.values} />
      ))}
      {dataset.groups.map((group) => (
        <MetadataSection
          key={`group-${group.path}`}
          title={group.path === "/" ? "Global attributes" : `Group attributes · ${group.path}`}
          values={Object.entries(group.attributes).map(([label, value]) => ({ label, value }))}
          empty="No declared attributes."
        />
      ))}
      {dataset.variables.filter((variable) => Object.keys(variable.attributes).length > 0).map((variable) => (
        <MetadataSection
          key={`variable-${variable.path}`}
          title={`Variable attributes · ${variable.path}`}
          values={Object.entries(variable.attributes).map(([label, value]) => ({ label, value }))}
        />
      ))}
    </div>
  );
}

function MetadataSection({
  title,
  values,
  empty,
}: {
  title: string;
  values: Array<{ label: string; value: StructuredValue }>;
  empty?: string;
}) {
  return (
    <section>
      <h3>{title}</h3>
      {values.length
        ? (
          <dl>
            {values.map(({ label, value }, index) => (
              <div key={`${label}-${index}`}>
                <dt>{label}</dt>
                <dd><StructuredCell value={value} /></dd>
              </div>
            ))}
          </dl>
        )
        : <p>{empty ?? "No metadata is available."}</p>}
    </section>
  );
}

function toggleSet<T>(current: Set<T>, value: T): Set<T> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function filterDraftFromField(
  field: StructuredField | undefined,
  id: number,
  filter?: StructuredFilter,
): FilterDraft {
  return {
    id,
    column: filter?.column ?? field?.name ?? "",
    operator: filter?.operator ?? defaultFilterOperator(field),
    value: filter?.operator === "is-null"
      ? ""
      : String(filter?.value ?? defaultFilterValue(field)),
  };
}

function sortDraftFromField(
  field: StructuredField | undefined,
  id: number,
  sort?: StructuredSort,
): SortDraft {
  return {
    id,
    column: sort?.column ?? field?.name ?? "",
    direction: sort?.direction ?? "asc",
  };
}

function isStructuredFilter(
  filter: StructuredFilter | undefined,
): filter is StructuredFilter {
  return filter !== undefined;
}

export function createStructuredFilter(
  fields: StructuredField[],
  column: string,
  operator: StructuredFilter["operator"],
  value: string,
): StructuredFilter | undefined {
  if (!column || (operator !== "is-null" && !value.trim())) return undefined;
  return {
    column,
    operator,
    ...(operator === "is-null"
      ? {}
      : { value: coerceFilterValue(value, fields, column) }),
  };
}

export function insertCurrentViewSQL(
  query: QueryState,
  allColumns: string[],
): string {
  const projection = query.projection?.length
    ? query.projection.map(sqlIdentifier).join(", ")
    : allColumns.length > 0
    ? allColumns.map(sqlIdentifier).join(", ")
    : "*";
  const lines = [`SELECT ${projection}`, "FROM data"];
  if (query.filters?.length) {
    lines.push(`WHERE ${query.filters.map(viewFilterSQL).join("\n  AND ")}`);
  }
  if (query.sorts?.length) {
    lines.push(`ORDER BY ${query.sorts.map((sort) =>
      `${sqlIdentifier(sort.column)} ${sort.direction.toUpperCase()}`
    ).join(", ")}`);
  }
  return lines.join("\n");
}

function viewFilterSQL(filter: StructuredFilter): string {
  const column = sqlIdentifier(filter.column);
  if (filter.operator === "is-null") return `${column} IS NULL`;
  if (filter.operator === "contains") {
    const value = String(filter.value ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_");
    return `${column}::VARCHAR ILIKE ${sqlValue(`%${value}%`)} ESCAPE '\\'`;
  }
  const operation = {
    eq: "=",
    neq: "<>",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
  }[filter.operator];
  return `${column} ${operation} ${sqlValue(filter.value)}`;
}

function sqlIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function sqlValue(value: StructuredFilter["value"]): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function coerceFilterValue(
  value: string,
  fields: StructuredField[],
  column: string,
): string | number | boolean {
  const type =
    fields.find((field) => field.name === column)?.physicalType.toLowerCase() ??
      "";
  if (
    /int|float|double|decimal|numeric|real/.test(type) &&
    Number.isFinite(Number(value))
  ) return Number(value);
  if (/bool/.test(type) && /^(true|false)$/i.test(value)) {
    return value.toLowerCase() === "true";
  }
  return value;
}

export function filterOperatorsForField(
  field: StructuredField | undefined,
): StructuredFilter["operator"][] {
  const kind = filterInputKind(field);
  if (kind === "boolean") return ["eq", "neq", "is-null"];
  if (kind === "number") {
    return ["eq", "neq", "gt", "gte", "lt", "lte", "is-null"];
  }
  return ["contains", "eq", "neq", "is-null"];
}

export function defaultFilterOperator(
  field: StructuredField | undefined,
): StructuredFilter["operator"] {
  return filterInputKind(field) === "text" ? "contains" : "eq";
}

function defaultFilterValue(field: StructuredField | undefined): string {
  return filterInputKind(field) === "boolean" ? "true" : "";
}

export function filterInputKind(
  field: StructuredField | undefined,
): "boolean" | "number" | "text" {
  const type = `${field?.physicalType ?? ""} ${field?.logicalType ?? ""}`
    .toLocaleLowerCase();
  if (/bool/.test(type)) return "boolean";
  if (/int|float|double|decimal|numeric|real/.test(type)) return "number";
  return "text";
}

function filterOperatorLabel(operator: StructuredFilter["operator"]): string {
  return {
    contains: "Contains",
    eq: "Equals",
    neq: "Does not equal",
    gt: "Greater than",
    gte: "At least",
    lt: "Less than",
    lte: "At most",
    "is-null": "Is null",
  }[operator];
}

function errorShape(caught: unknown): StructuredErrorShape {
  if (caught instanceof StructuredDataClientError) return caught.shape;
  if (caught instanceof DOMException && caught.name === "AbortError") {
    return {
      code: "aborted",
      message: "The operation was canceled.",
      retryable: true,
    };
  }
  return {
    code: "internal",
    message: caught instanceof Error
      ? caught.message
      : "The file could not be opened.",
    retryable: true,
  };
}

function exportPage(
  format: "csv" | "json",
  fileName: string,
  page: StructuredPage | undefined,
  columns: string[],
  selected: Set<number>,
  limits: StructuredDataLimits["exports"],
): void {
  if (!page) return;
  const rows = selected.size > 0
    ? page.rows.filter((_, index) => selected.has(index))
    : page.rows;
  if (rows.length > limits.maxRows) {
    throw new StructuredDataClientError({
      code: "limit",
      message: `Exports are limited to ${limits.maxRows.toLocaleString()} rows. Narrow the current result before exporting.`,
      retryable: false,
    });
  }
  const projected = rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))
  );
  const content = format === "json"
    ? `${JSON.stringify(projected, null, 2)}\n`
    : [
      columns.map(csvCell).join(","),
      ...projected.map((row) =>
        columns.map((column) => csvCell(row[column])).join(",")
      ),
    ].join("\n");
  const contentBytes = new TextEncoder().encode(content).byteLength;
  if (contentBytes > limits.maxBytes) {
    throw new StructuredDataClientError({
      code: "limit",
      message: `This export is ${formatExportBytes(contentBytes)} and exceeds the ${formatExportBytes(limits.maxBytes)} export limit. Narrow the current result before exporting.`,
      retryable: false,
    });
  }
  const blob = new Blob([content], {
    type: format === "json" ? "application/json" : "text/csv",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName}.page.${format}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatExportBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toLocaleString()} bytes`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024).toLocaleString()} KB`;
  return `${Math.ceil(bytes / 1024 / 1024).toLocaleString()} MB`;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "object"
    ? JSON.stringify(value)
    : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
