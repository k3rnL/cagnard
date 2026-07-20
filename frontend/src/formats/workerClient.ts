import type {
  StructuredErrorShape,
  StructuredInspection,
  StructuredPage,
  StructuredPageRequest,
  StructuredRelationScope,
  StructuredSQLRequest,
  StructuredSQLResult,
  IcebergSnapshot,
  NetCDFSliceRequest,
  NetCDFSliceResult,
  StructuredSourceDefinition
} from "./models";
import type { StructuredWorkerRequest, StructuredWorkerResponse } from "./workerProtocol";
import { isTerminalWorkerResponse } from "./workerProtocol";

export class StructuredDataClientError extends Error {
  constructor(readonly shape: StructuredErrorShape) {
    super(shape.message);
    this.name = "StructuredDataClientError";
  }
}

// True when the worker no longer holds the source, which happens when a
// sign-out or session reset shuts the runtime down underneath an open file.
// Callers recover by re-opening the source rather than surfacing the error.
export function isLostSessionError(caught: unknown): boolean {
  return caught instanceof StructuredDataClientError && caught.shape.code === "session-lost";
}

interface PendingRequest {
  resolve: (response: StructuredWorkerResponse) => void;
  reject: (reason: unknown) => void;
  progress?: (phase: string, loaded?: number, total?: number) => void;
  abortCleanup?: () => void;
}

export class StructuredDataWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly closedSources = new Set<string>();
  private readonly closingSources = new Map<string, Promise<void>>();
  private shutdownPromise?: Promise<void>;
  private terminated = false;

  constructor(
    worker?: Worker,
    private readonly onFatal?: (error: StructuredDataClientError) => void,
  ) {
    this.worker = worker ?? new Worker(new URL("./structuredData.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<StructuredWorkerResponse>) => this.receive(event.data);
    this.worker.onerror = (event) => {
      if (this.terminated) return;
      this.terminated = true;
      const error = new StructuredDataClientError({
        code: "internal",
        message: "The structured-data worker stopped unexpectedly.",
        detail: event.message,
        retryable: true
      });
      this.pending.forEach(({ reject, abortCleanup }) => {
        abortCleanup?.();
        reject(error);
      });
      this.pending.clear();
      this.worker.terminate();
      this.onFatal?.(error);
    };
  }

  async initialize(
    source: StructuredSourceDefinition,
    signal?: AbortSignal,
    progress?: (phase: string, loaded?: number, total?: number) => void
  ): Promise<StructuredInspection> {
    this.closedSources.delete(source.sourceId);
    const response = await this.request({ id: nextId(), type: "initialize", source }, signal, progress);
    if (response.type !== "initialized") throw unexpected(response);
    return response.inspection;
  }

  async inspect(sourceId: string, signal?: AbortSignal): Promise<StructuredInspection> {
    const response = await this.request({ id: nextId(), type: "inspect", sourceId }, signal);
    if (response.type !== "inspection") throw unexpected(response);
    return response.inspection;
  }

  async page(sourceId: string, request: StructuredPageRequest, signal?: AbortSignal): Promise<StructuredPage> {
    const response = await this.request({ id: nextId(), type: "page", sourceId, request }, signal);
    if (response.type !== "page") throw unexpected(response);
    return response.page;
  }

  async query(sourceId: string, request: StructuredPageRequest, signal?: AbortSignal): Promise<StructuredPage> {
    const response = await this.request({ id: nextId(), type: "query", sourceId, request }, signal);
    if (response.type !== "page") throw unexpected(response);
    return response.page;
  }

  async relationScope(sourceId: string, signal?: AbortSignal): Promise<StructuredRelationScope> {
    const response = await this.request({ id: nextId(), type: "relation-scope", sourceId }, signal);
    if (response.type !== "relation-scope") throw unexpected(response);
    return response.scope;
  }

  async sql(sourceId: string, request: StructuredSQLRequest, signal?: AbortSignal): Promise<StructuredSQLResult> {
    const response = await this.request({ id: nextId(), type: "sql", sourceId, request }, signal);
    if (response.type !== "sql") throw unexpected(response);
    return response.result;
  }

  async icebergSnapshots(sourceId: string, signal?: AbortSignal): Promise<IcebergSnapshot[]> {
    const response = await this.request({ id: nextId(), type: "iceberg-snapshots", sourceId }, signal);
    if (response.type !== "iceberg-snapshots") throw unexpected(response);
    return response.snapshots;
  }

  async selectIcebergSnapshot(sourceId: string, snapshotId: string | undefined, signal?: AbortSignal): Promise<StructuredInspection> {
    const response = await this.request({ id: nextId(), type: "iceberg-select-snapshot", sourceId, snapshotId }, signal);
    if (response.type !== "inspection") throw unexpected(response);
    return response.inspection;
  }

  async netcdfSlice(
    sourceId: string,
    request: NetCDFSliceRequest,
    signal?: AbortSignal,
  ): Promise<NetCDFSliceResult> {
    const response = await this.request({ id: nextId(), type: "netcdf-slice", sourceId, request }, signal);
    if (response.type !== "netcdf-slice") throw unexpected(response);
    return response.result;
  }

  closeSource(sourceId: string): Promise<void> {
    if (this.terminated || this.shutdownPromise || this.closedSources.has(sourceId)) {
      return Promise.resolve();
    }
    const current = this.closingSources.get(sourceId);
    if (current) return current;
    const closing = this.request({ id: nextId(), type: "close", sourceId })
      .then((response) => {
        if (response.type !== "closed") throw unexpected(response);
      })
      .finally(() => {
        this.closingSources.delete(sourceId);
        this.closedSources.add(sourceId);
      });
    this.closingSources.set(sourceId, closing);
    return closing;
  }

  shutdown(): Promise<void> {
    if (this.terminated) return Promise.resolve();
    if (this.shutdownPromise) return this.shutdownPromise;
    const pending = this.request({ id: nextId(), type: "shutdown" })
      .then((response) => {
        if (response.type !== "shutdown") throw unexpected(response);
      })
      .finally(() => this.terminate());
    this.shutdownPromise = pending;
    return pending;
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.worker.terminate();
    const error = new DOMException("Worker terminated", "AbortError");
    this.pending.forEach(({ reject, abortCleanup }) => {
      abortCleanup?.();
      reject(error);
    });
    this.pending.clear();
    this.closingSources.clear();
    this.closedSources.clear();
  }

  private request(
    request: Exclude<StructuredWorkerRequest, { type: "cancel" }>,
    signal?: AbortSignal,
    progress?: PendingRequest["progress"]
  ): Promise<StructuredWorkerResponse> {
    if (this.terminated) return Promise.reject(new DOMException("Worker terminated", "AbortError"));
    // A shutdown closes every source while the worker keeps answering, so
    // requests sent after it starts would fail as lost sessions instead of
    // as the cancellation they are.
    if (this.shutdownPromise && request.type !== "shutdown") {
      return Promise.reject(new DOMException("Worker shutting down", "AbortError"));
    }
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.pending.delete(request.id);
        this.worker.postMessage({ id: nextId(), type: "cancel", targetId: request.id } satisfies StructuredWorkerRequest);
        reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      };
      if (signal) signal.addEventListener("abort", abort, { once: true });
      this.pending.set(request.id, {
        resolve,
        reject,
        progress,
        abortCleanup: signal ? () => signal.removeEventListener("abort", abort) : undefined
      });
      this.worker.postMessage(request);
    });
  }

  private receive(response: StructuredWorkerResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    if (response.type === "progress") {
      pending.progress?.(response.phase, response.loaded, response.total);
      return;
    }
    if (!isTerminalWorkerResponse(response)) return;
    this.pending.delete(response.id);
    pending.abortCleanup?.();
    if (response.type === "error") pending.reject(new StructuredDataClientError(response.error));
    else pending.resolve(response);
  }
}

function nextId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function unexpected(response: StructuredWorkerResponse): Error {
  return new Error(`Unexpected worker response '${response.type}'.`);
}
