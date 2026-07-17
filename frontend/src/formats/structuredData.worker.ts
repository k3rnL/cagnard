/// <reference lib="webworker" />

import type { StructuredSourceFactory, StructuredDataSource } from "./readers/types";
import { normalizeReaderError, StructuredReaderError } from "./readers/shared";
import type { StructuredWorkerRequest, StructuredWorkerResponse } from "./workerProtocol";
import { structuredWorkerResponseFits } from "./workerProtocol";

const workerScope = self as DedicatedWorkerGlobalScope;
const sources = new Map<string, StructuredDataSource>();
const operations = new Map<string, AbortController>();
const operationSources = new Map<string, string>();
const closingSources = new Set<string>();
let parquetRuntimeLoaded = false;

workerScope.onmessage = (event: MessageEvent<StructuredWorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    operations.get(request.targetId)?.abort();
    post({ id: request.id, type: "canceled" });
    return;
  }
  void handle(request);
};

async function handle(request: Exclude<StructuredWorkerRequest, { type: "cancel" }>): Promise<void> {
  const controller = new AbortController();
  operations.set(request.id, controller);
  const sourceId = "sourceId" in request
    ? request.sourceId
    : request.type === "initialize"
    ? request.source.sourceId
    : undefined;
  if (sourceId) operationSources.set(request.id, sourceId);
  try {
    if (request.type === "initialize") {
      validateSource(request.source.contentUrl);
      const previous = sources.get(request.source.sourceId);
      if (previous) await previous.close();
      const factory = await loadFactory(request.source.format);
      const source = await factory(request.source, controller.signal, (phase, loaded, total) => {
        post({ id: request.id, type: "progress", phase, loaded, total });
      });
      if (controller.signal.aborted) {
        await source.close();
        controller.signal.throwIfAborted();
      }
      if (closingSources.delete(request.source.sourceId)) {
        await source.close();
        throw new DOMException("Source closed", "AbortError");
      }
      sources.set(request.source.sourceId, source);
      const inspection = await source.inspect(controller.signal);
      postBounded({ id: request.id, type: "initialized", inspection });
      return;
    }
    if (request.type === "shutdown") {
      operations.forEach((operation, id) => {
        if (id !== request.id) operation.abort();
      });
      await Promise.all(Array.from(sources.values(), (source) =>
        source.close().catch(() => undefined)
      ));
      sources.clear();
      closingSources.clear();
      if (parquetRuntimeLoaded) {
        const { shutdownParquetRuntime } = await import("./readers/parquet");
        await shutdownParquetRuntime();
      }
      post({ id: request.id, type: "shutdown" });
      return;
    }
    if (request.type === "close") {
      closingSources.add(request.sourceId);
      operationSources.forEach((operationSource, operationId) => {
        if (operationSource === request.sourceId && operationId !== request.id) {
          operations.get(operationId)?.abort();
        }
      });
      const source = sources.get(request.sourceId);
      if (source) await source.close();
      sources.delete(request.sourceId);
      closingSources.delete(request.sourceId);
      post({ id: request.id, type: "closed" });
      return;
    }
    const source = requireSource(request.sourceId);
    if (request.type === "inspect") {
      postBounded({ id: request.id, type: "inspection", inspection: await source.inspect(controller.signal) });
      return;
    }
    if (request.type === "page" || request.type === "query") {
      postBounded({ id: request.id, type: "page", page: await source.page(request.request, controller.signal) });
      return;
    }
  } catch (caught) {
    post({ id: request.id, type: "error", error: normalizeReaderError(caught) });
  } finally {
    operations.delete(request.id);
    operationSources.delete(request.id);
  }
}

function validateSource(contentUrl: string): void {
  let url: URL;
  try {
    url = new URL(contentUrl, workerScope.location.origin);
  } catch {
    throw new StructuredReaderError("authorization", "The structured-data content URL is invalid.");
  }
  if (url.origin !== workerScope.location.origin || url.pathname !== "/api/storage/content") {
    throw new StructuredReaderError(
      "authorization",
      "Structured-data readers only accept same-origin Cagnard content URLs."
    );
  }
}

async function loadFactory(format: string): Promise<StructuredSourceFactory> {
  switch (format) {
    case "parquet":
      parquetRuntimeLoaded = true;
      return (await import("./readers/parquet")).createParquetSource;
    case "avro":
      return (await import("./readers/avro")).createAvroSource;
    case "arrow-ipc":
      return (await import("./readers/arrow")).createArrowSource;
    case "ndjson":
      return (definition) => import("./readers/ndjson").then(({ createNDJSONSource }) => createNDJSONSource(definition));
    case "delimited-text":
      return (definition) => import("./readers/delimited").then(({ createDelimitedSource }) => createDelimitedSource(definition));
    default:
      throw new StructuredReaderError("unsupported-format", `Structured format '${format}' is not supported.`);
  }
}

function requireSource(sourceId: string): StructuredDataSource {
  const source = sources.get(sourceId);
  if (!source) throw new StructuredReaderError("internal", "The data-source session is no longer available.", { retryable: true });
  return source;
}

function postBounded(response: StructuredWorkerResponse): void {
  if (!structuredWorkerResponseFits(response)) {
    throw new StructuredReaderError("limit", "The requested page exceeds the 16 MB worker response limit.");
  }
  post(response);
}

function post(response: StructuredWorkerResponse): void {
  workerScope.postMessage(response);
}
