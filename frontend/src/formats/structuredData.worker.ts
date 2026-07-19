/// <reference lib="webworker" />

import type { StructuredSourceFactory, StructuredDataSource } from "./readers/types";
import { normalizeReaderError, StructuredReaderError } from "./readers/shared";
import type { StructuredWorkerRequest, StructuredWorkerResponse } from "./workerProtocol";
import { structuredWorkerResponseFits } from "./workerProtocol";

const workerScope = self as DedicatedWorkerGlobalScope;
const sources = new Map<string, StructuredDataSource>();
const sourceResponseLimits = new Map<string, number>();
const operations = new Map<string, AbortController>();
const operationSources = new Map<string, string>();
const closingSources = new Set<string>();

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
      let source: StructuredDataSource | undefined;
      try {
        const factory = await loadFactory(request.source.format);
        source = await factory(request.source, controller.signal, (phase, loaded, total) => {
          post({ id: request.id, type: "progress", phase, loaded, total });
        });
        if (["avro", "arrow-ipc", "ndjson", "delimited-text"].includes(request.source.format)) {
          const { addBoundedRelation } = await import("./readers/relationalSource");
          source = await addBoundedRelation(
            source,
            request.source,
            controller.signal,
            (phase, loaded, total) => post({ id: request.id, type: "progress", phase, loaded, total }),
          );
        }
        controller.signal.throwIfAborted();
        if (closingSources.delete(request.source.sourceId)) {
          throw new DOMException("Source closed", "AbortError");
        }
        const inspection = await source.inspect(controller.signal);
        postBounded(
          { id: request.id, type: "initialized", inspection },
          request.source.limits.worker.maxResponseBytes,
        );
        sources.set(request.source.sourceId, source);
        sourceResponseLimits.set(
          request.source.sourceId,
          request.source.limits.worker.maxResponseBytes,
        );
        return;
      } catch (caught) {
        await source?.close().catch(() => undefined);
        sources.delete(request.source.sourceId);
        sourceResponseLimits.delete(request.source.sourceId);
        throw caught;
      }
    }
    if (request.type === "shutdown") {
      operations.forEach((operation, id) => {
        if (id !== request.id) operation.abort();
      });
      await Promise.all(Array.from(sources.values(), (source) =>
        source.close().catch(() => undefined)
      ));
      sources.clear();
			sourceResponseLimits.clear();
      closingSources.clear();
      const { shutdownDuckDBRuntime } = await import("./readers/duckdbRuntime");
      await shutdownDuckDBRuntime();
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
			sourceResponseLimits.delete(request.sourceId);
      closingSources.delete(request.sourceId);
      post({ id: request.id, type: "closed" });
      return;
    }
    const source = requireSource(request.sourceId);
    if (request.type === "inspect") {
			postBounded({ id: request.id, type: "inspection", inspection: await source.inspect(controller.signal) }, responseLimit(request.sourceId));
      return;
    }
    if (request.type === "relation-scope") {
      const scope = source.relationScope?.();
      if (!scope) throw new StructuredReaderError("unsupported-format", "This source does not expose a SQL relation.");
			postBounded({ id: request.id, type: "relation-scope", scope }, responseLimit(request.sourceId));
      return;
    }
    if (request.type === "sql") {
      if (!source.sql) throw new StructuredReaderError("unsupported-format", "SQL is not available for this source.");
			postBounded({ id: request.id, type: "sql", result: await source.sql(request.request, controller.signal) }, responseLimit(request.sourceId));
      return;
    }
    if (request.type === "iceberg-snapshots") {
      if (!source.icebergSnapshots) throw new StructuredReaderError("unsupported-format", "Snapshots are not available for this source.");
			postBounded({ id: request.id, type: "iceberg-snapshots", snapshots: await source.icebergSnapshots(controller.signal) }, responseLimit(request.sourceId));
      return;
    }
    if (request.type === "iceberg-select-snapshot") {
      if (!source.selectIcebergSnapshot) throw new StructuredReaderError("unsupported-format", "Snapshot selection is not available for this source.");
			postBounded({ id: request.id, type: "inspection", inspection: await source.selectIcebergSnapshot(request.snapshotId, controller.signal) }, responseLimit(request.sourceId));
      return;
    }
    if (request.type === "netcdf-slice") {
      if (!source.netcdfSlice) throw new StructuredReaderError("unsupported-format", "NetCDF slicing is not available for this source.");
			postBounded({ id: request.id, type: "netcdf-slice", result: await source.netcdfSlice(request.request, controller.signal) }, responseLimit(request.sourceId));
      return;
    }
    if (request.type === "page" || request.type === "query") {
			postBounded({ id: request.id, type: "page", page: await source.page(request.request, controller.signal) }, responseLimit(request.sourceId));
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
  if (
    url.origin !== workerScope.location.origin ||
    (url.pathname !== "/api/storage/content" && !url.pathname.startsWith("/api/storage/iceberg/content/"))
  ) {
    throw new StructuredReaderError(
      "authorization",
      "Structured-data readers only accept same-origin Cagnard content URLs."
    );
  }
}

async function loadFactory(format: string): Promise<StructuredSourceFactory> {
  switch (format) {
    case "parquet":
      return (await import("./readers/parquet")).createParquetSource;
    case "avro":
      return (await import("./readers/avro")).createAvroSource;
    case "arrow-ipc":
      return (await import("./readers/arrow")).createArrowSource;
    case "ndjson":
      return (definition) => import("./readers/ndjson").then(({ createNDJSONSource }) => createNDJSONSource(definition));
    case "delimited-text":
      return (definition) => import("./readers/delimited").then(({ createDelimitedSource }) => createDelimitedSource(definition));
    case "iceberg":
      return (await import("./readers/iceberg")).createIcebergSource;
    case "netcdf":
      return (await import("./readers/netcdf")).createNetCDFSource;
    default:
      throw new StructuredReaderError("unsupported-format", `Structured format '${format}' is not supported.`);
  }
}

function requireSource(sourceId: string): StructuredDataSource {
  const source = sources.get(sourceId);
  if (!source) throw new StructuredReaderError("internal", "The data-source session is no longer available.", { retryable: true });
  return source;
}

function responseLimit(sourceId: string): number {
	return sourceResponseLimits.get(sourceId) ?? 16 * 1024 * 1024;
}

function postBounded(response: StructuredWorkerResponse, maximumBytes: number): void {
  if (!structuredWorkerResponseFits(response, maximumBytes)) {
    throw new StructuredReaderError(
			"limit",
			`The requested result exceeds the ${formatByteLimit(maximumBytes)} worker response limit.`,
		);
  }
  post(response);
}

function formatByteLimit(bytes: number): string {
	return bytes % (1024 * 1024) === 0
		? `${bytes / 1024 / 1024} MB`
		: `${bytes.toLocaleString()} bytes`;
}

function post(response: StructuredWorkerResponse): void {
  workerScope.postMessage(response);
}
