import type {
  StructuredErrorShape,
  StructuredInspection,
  StructuredPage,
  StructuredPageRequest,
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

interface PendingRequest {
  resolve: (response: StructuredWorkerResponse) => void;
  reject: (reason: unknown) => void;
  progress?: (phase: string, loaded?: number, total?: number) => void;
  abortCleanup?: () => void;
}

export class StructuredDataWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<string, PendingRequest>();
  private terminated = false;

  constructor(worker?: Worker) {
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
    };
  }

  async initialize(
    source: StructuredSourceDefinition,
    signal?: AbortSignal,
    progress?: (phase: string, loaded?: number, total?: number) => void
  ): Promise<StructuredInspection> {
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

  async close(sourceId: string): Promise<void> {
    if (this.terminated) return;
    try {
      const response = await this.request({ id: nextId(), type: "close", sourceId });
      if (response.type !== "closed") throw unexpected(response);
    } finally {
      this.terminate();
    }
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
  }

  private request(
    request: Exclude<StructuredWorkerRequest, { type: "cancel" }>,
    signal?: AbortSignal,
    progress?: PendingRequest["progress"]
  ): Promise<StructuredWorkerResponse> {
    if (this.terminated) return Promise.reject(new DOMException("Worker terminated", "AbortError"));
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
