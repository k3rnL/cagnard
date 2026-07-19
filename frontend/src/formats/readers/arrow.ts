import { RecordBatchReader, tableFromIPC } from "apache-arrow";
import type { Field, RecordBatch } from "apache-arrow";

import type {
  StructuredField,
  StructuredInspection,
  StructuredPage,
  StructuredPageRequest,
  StructuredSourceDefinition,
  StructuredValue,
} from "../models";
import { fetchBoundedFile } from "./rangeFetch";
import { InMemoryStructuredSource } from "./inMemory";
import {
  boundedLimit,
  encodeOffsetCursor,
  normalizeValue,
  parseOffsetCursor,
  StructuredReaderError,
} from "./shared";
import type { StructuredDataSource } from "./types";

const arrowFileBufferLimit = 64 * 1024 * 1024;
const arrowStreamByteLimit = 128 * 1024 * 1024;
const arrowStreamCachedRows = 20_000;

export async function createArrowSource(
  definition: StructuredSourceDefinition,
  signal: AbortSignal,
  progress: (phase: string, loaded?: number, total?: number) => void,
): Promise<StructuredDataSource> {
  return isDeclaredStream(definition)
    ? createArrowStreamSource(definition, signal, progress)
    : createBufferedArrowSource(definition, signal, progress);
}

async function createBufferedArrowSource(
  definition: StructuredSourceDefinition,
  signal: AbortSignal,
  progress: (phase: string, loaded?: number, total?: number) => void,
): Promise<StructuredDataSource> {
  progress("Downloading Arrow file", 0, definition.size);
  const bytes = await fetchBoundedFile(
    definition.contentUrl,
    definition.size,
    arrowFileBufferLimit,
    signal,
  );
  progress("Decoding Arrow batches", bytes.length, bytes.length);
  try {
    const table = tableFromIPC(bytes);
    const fields = table.schema.fields.map(toStructuredField);
    const rows: Array<Record<string, StructuredValue>> = [];
    for (let index = 0; index < table.numRows; index += 1) {
      signal.throwIfAborted();
      rows.push(normalizeRecord(table.get(index)));
    }
    const inspection: StructuredInspection = {
      format: "arrow-ipc",
      formatLabel: "Arrow IPC / Feather",
      variant: "IPC file / Feather",
      schema: fields,
      capabilities: exactInMemoryCapabilities,
      totalRows: table.numRows,
      metadata: [
        {
          title: "Arrow container",
          values: [
            { label: "Variant", value: "IPC file / Feather" },
            { label: "Record batches", value: table.batches.length },
            { label: "Rows", value: table.numRows },
            { label: "Columns", value: table.numCols },
            { label: "Buffered size", value: bytes.length },
          ],
        },
        {
          title: "Schema metadata",
          values: Array.from(table.schema.metadata.entries()).map((
            [label, value],
          ) => ({ label, value })),
        },
      ].filter((section) => section.values.length > 0),
      warnings: [
        `Arrow IPC file and Feather inputs are buffered and limited to ${
          arrowFileBufferLimit / 1024 / 1024
        } MB.`,
      ],
    };
    return new InMemoryStructuredSource(inspection, rows);
  } catch (caught) {
    if (
      caught instanceof StructuredReaderError ||
      (caught instanceof DOMException && caught.name === "AbortError")
    ) {
      throw caught;
    }
    throw new StructuredReaderError(
      "malformed",
      "The Arrow IPC or Feather file is malformed or unsupported.",
      {
        detail: caught instanceof Error ? caught.message : String(caught),
      },
    );
  }
}

async function createArrowStreamSource(
  definition: StructuredSourceDefinition,
  signal: AbortSignal,
  progress: (phase: string, loaded?: number, total?: number) => void,
): Promise<StructuredDataSource> {
  if (definition.size !== undefined && definition.size > arrowStreamByteLimit) {
    throw new StructuredReaderError(
      "limit",
      `Arrow IPC stream inspection is limited to ${
        arrowStreamByteLimit / 1024 / 1024
      } MB per open session.`,
    );
  }
  progress("Opening Arrow IPC stream", 0, definition.size);
  const response = await fetch(definition.contentUrl, {
    credentials: "same-origin",
    signal,
  });
  if (response.status === 401 || response.status === 403) {
    throw new StructuredReaderError(
      "authorization",
      "Access to this file was denied.",
    );
  }
  if (!response.ok || !response.body) {
    throw new StructuredReaderError(
      "network",
      `Storage returned HTTP ${response.status}.`,
      { retryable: true },
    );
  }
  const contentLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > arrowStreamByteLimit) {
    await response.body.cancel();
    throw new StructuredReaderError(
      "limit",
      `Arrow IPC stream inspection is limited to ${
        arrowStreamByteLimit / 1024 / 1024
      } MB per open session.`,
    );
  }
  try {
    const stream = countedBody(
      response.body,
      signal,
      definition.size,
      progress,
    );
    const reader = await RecordBatchReader.from(stream);
    await reader.open({ autoDestroy: false });
    signal.throwIfAborted();
    return new ArrowStreamSource(reader, definition);
  } catch (caught) {
    if (
      caught instanceof StructuredReaderError ||
      (caught instanceof DOMException && caught.name === "AbortError")
    ) {
      throw caught;
    }
    throw new StructuredReaderError(
      "malformed",
      "The Arrow IPC stream is malformed or unsupported.",
      {
        detail: caught instanceof Error ? caught.message : String(caught),
      },
    );
  }
}

class ArrowStreamSource implements StructuredDataSource {
  private rows: Array<Record<string, StructuredValue>> = [];
  private baseOffset = 0;
  private done = false;
  private batches = 0;
  private closed = false;
  private readonly inspectionValue: StructuredInspection;

  constructor(
    private readonly reader: Awaited<ReturnType<typeof RecordBatchReader.from>>,
    definition: StructuredSourceDefinition,
  ) {
    this.inspectionValue = {
      format: "arrow-ipc",
      formatLabel: "Arrow IPC stream",
      variant: "IPC stream",
      schema: this.reader.schema.fields.map(toStructuredField),
      capabilities: {
        exactCount: false,
        exactFilter: false,
        exactProjection: false,
        exactSort: false,
        pagination: "cursor",
        exportCurrentPage: true,
        sql: false,
      },
      metadata: [],
      warnings: [
        `Record batches are consumed incrementally; up to ${arrowStreamCachedRows.toLocaleString()} recently read rows remain available for backward paging.`,
        `One open stream is limited to ${
          arrowStreamByteLimit / 1024 / 1024
        } MB.`,
      ],
    };
    this.updateMetadata(definition);
  }

  async inspect(signal: AbortSignal): Promise<StructuredInspection> {
    signal.throwIfAborted();
    return this.inspectionValue;
  }

  async page(
    request: StructuredPageRequest,
    signal: AbortSignal,
  ): Promise<StructuredPage> {
    if (
      request.filters?.length || request.sorts?.length ||
      request.projection?.length
    ) {
      throw new StructuredReaderError(
        "unsupported-format",
        "Global filtering, sorting, and projection are not available for an Arrow IPC stream.",
      );
    }
    const offset = parseOffsetCursor("arrow-stream", request.cursor);
    const limit = boundedLimit(request.limit);
    if (offset < this.baseOffset) {
      throw new StructuredReaderError(
        "limit",
        "This earlier stream page is no longer cached. Reopen the file to read it again.",
      );
    }
    // One-row lookahead avoids exposing a spurious empty final page when the
    // stream ends exactly on a page boundary.
    await this.readThrough(offset + limit + 1, signal);
    const localOffset = offset - this.baseOffset;
    const rows = this.rows.slice(localOffset, localOffset + limit);
    const nextOffset = offset + rows.length;
    const hasMore = !this.done ||
      nextOffset < this.baseOffset + this.rows.length;
    return {
      columns: this.inspectionValue.schema.map((field) => field.name),
      rows,
      offset,
      nextCursor: hasMore && rows.length > 0
        ? encodeOffsetCursor("arrow-stream", nextOffset)
        : undefined,
      totalRows: this.done ? this.baseOffset + this.rows.length : undefined,
      partial: hasMore,
      issues: [],
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.reader.cancel().catch(() => undefined);
    this.rows = [];
  }

  private async readThrough(
    targetOffset: number,
    signal: AbortSignal,
  ): Promise<void> {
    while (!this.done && this.baseOffset + this.rows.length < targetOffset) {
      signal.throwIfAborted();
      const abort = () => void this.reader.cancel();
      signal.addEventListener("abort", abort, { once: true });
      let result: IteratorResult<RecordBatch>;
      try {
        result = await this.reader.next();
      } finally {
        signal.removeEventListener("abort", abort);
      }
      signal.throwIfAborted();
      if (result.done) {
        this.done = true;
        this.inspectionValue.totalRows = this.baseOffset + this.rows.length;
        break;
      }
      this.batches += 1;
      for (let index = 0; index < result.value.numRows; index += 1) {
        signal.throwIfAborted();
        this.rows.push(normalizeRecord(result.value.get(index)));
      }
      if (this.rows.length > arrowStreamCachedRows) {
        const discard = this.rows.length - arrowStreamCachedRows;
        this.rows.splice(0, discard);
        this.baseOffset += discard;
      }
      this.updateMetadata();
    }
  }

  private updateMetadata(definition?: StructuredSourceDefinition): void {
    this.inspectionValue.metadata = [
      {
        title: "Arrow stream",
        values: [
          { label: "Variant", value: "IPC stream" },
          { label: "Record batches read", value: this.batches },
          { label: "Rows read", value: this.baseOffset + this.rows.length },
          { label: "Columns", value: this.inspectionValue.schema.length },
          { label: "Declared size", value: definition?.size ?? "Unknown" },
          { label: "Complete", value: this.done },
        ],
      },
      {
        title: "Schema metadata",
        values: Array.from(this.reader.schema.metadata.entries()).map((
          [label, value],
        ) => ({ label, value })),
      },
    ].filter((section) => section.values.length > 0);
  }
}

async function* countedBody(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  declaredSize: number | undefined,
  progress: (phase: string, loaded?: number, total?: number) => void,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  const abort = () => void reader.cancel(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  let loaded = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const result = await reader.read();
      if (result.done) return;
      loaded += result.value.byteLength;
      if (loaded > arrowStreamByteLimit) {
        throw new StructuredReaderError(
          "limit",
          `Arrow IPC stream inspection is limited to ${
            arrowStreamByteLimit / 1024 / 1024
          } MB per open session.`,
        );
      }
      progress("Reading Arrow record batches", loaded, declaredSize);
      yield result.value;
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

const exactInMemoryCapabilities = {
  exactCount: true,
  exactFilter: true,
  exactProjection: true,
  exactSort: true,
  pagination: "offset" as const,
  exportCurrentPage: true,
  sql: false,
};

function toStructuredField(field: Field): StructuredField {
  const children = "children" in field.type ? field.type.children : undefined;
  return {
    name: field.name,
    physicalType: field.type.toString(),
    nullable: field.nullable,
    children: children?.map(toStructuredField),
    metadata: field.metadata.size > 0
      ? Object.fromEntries(field.metadata.entries())
      : undefined,
  };
}

function normalizeRecord(value: unknown): Record<string, StructuredValue> {
  const normalized = normalizeValue(value);
  return normalized && typeof normalized === "object" &&
      !Array.isArray(normalized) && !("kind" in normalized)
    ? (normalized as Record<string, StructuredValue>)
    : { value: normalized };
}

function isDeclaredStream(definition: StructuredSourceDefinition): boolean {
  const mime = definition.mimeType?.split(";")[0]?.trim().toLowerCase();
  return mime === "application/vnd.apache.arrow.stream" ||
    definition.name.toLowerCase().endsWith(".ipc");
}
