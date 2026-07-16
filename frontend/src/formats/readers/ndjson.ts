import type {
  StructuredInspection,
  StructuredPage,
  StructuredPageIssue,
  StructuredPageRequest,
  StructuredSourceDefinition,
  StructuredValue,
} from "../models";
import { fetchByteRange } from "./rangeFetch";
import {
  boundedLimit,
  encodeSequentialCursor,
  inferSchema,
  normalizeValue,
  parseSequentialCursor,
  StructuredReaderError,
} from "./shared";
import type { StructuredDataSource } from "./types";

const chunkBytes = 256 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });

export async function createNDJSONSource(
  definition: StructuredSourceDefinition,
): Promise<StructuredDataSource> {
  return new NDJSONSource(definition);
}

class NDJSONSource implements StructuredDataSource {
  private inspection?: StructuredInspection;

  constructor(private readonly definition: StructuredSourceDefinition) {}

  async inspect(signal: AbortSignal): Promise<StructuredInspection> {
    if (this.inspection) return this.inspection;
    const sample = await this.page({ limit: 100 }, signal);
    this.inspection = {
      format: "ndjson",
      formatLabel: "JSON Lines",
      variant: "UTF-8, one JSON value per line",
      schema: inferSchema(sample.rows),
      capabilities: {
        exactCount: false,
        exactFilter: false,
        exactProjection: false,
        exactSort: false,
        pagination: "cursor",
        exportCurrentPage: true,
      },
      metadata: [
        {
          title: "Container",
          values: [
            { label: "Encoding", value: "UTF-8" },
            { label: "Page cursor", value: "Byte offset" },
          ],
        },
      ],
      warnings: sample.issues.length > 0
        ? ["Some sampled records are malformed; open Data for line details."]
        : [],
    };
    return this.inspection;
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
        "Global filtering, sorting, and projection are not available for JSON Lines.",
      );
    }
    const limit = boundedLimit(request.limit);
    const initial = parseSequentialCursor("ndjson", request.cursor, {
      byteOffset: 0,
      rowOffset: 0,
      line: 1,
    });
    const rows: Array<Record<string, StructuredValue>> = [];
    const issues: StructuredPageIssue[] = [];
    let buffer = new Uint8Array();
    let bufferStart = initial.byteOffset;
    let fetchOffset = initial.byteOffset;
    let lineNumber = initial.line ?? 1;
    let knownTotal = this.definition.size;
    let reachedEnd = false;

    while (rows.length < limit && !reachedEnd) {
      const response = await fetchByteRange(
        this.definition.contentUrl,
        fetchOffset,
        chunkBytes,
        signal,
      );
      if (response.total !== undefined) knownTotal = response.total;
      if (response.bytes.length === 0) {
        reachedEnd = true;
        break;
      }
      const combinedStart = buffer.length > 0 ? bufferStart : response.start;
      const combined = concatenate(buffer, response.bytes);
      let recordStart = 0;
      for (let index = 0; index < combined.length; index += 1) {
        if (combined[index] !== 0x0a) continue;
        const lineOffset = combinedStart + recordStart;
        const line = trimTrailingCR(combined.subarray(recordStart, index));
        recordStart = index + 1;
        addRecord(line, lineOffset, lineNumber, rows, issues);
        lineNumber += 1;
        if (rows.length >= limit) {
          const nextCursor = encodeSequentialCursor("ndjson", {
            byteOffset: combinedStart + recordStart,
            rowOffset: initial.rowOffset + rows.length,
            line: lineNumber,
          });
          return pageResult(rows, issues, initial.rowOffset, nextCursor);
        }
      }
      buffer = combined.slice(recordStart);
      bufferStart = combinedStart + recordStart;
      fetchOffset = response.end + 1;
      reachedEnd = (knownTotal !== undefined && fetchOffset >= knownTotal) ||
        response.bytes.length < chunkBytes || !response.partial;
      if (buffer.byteLength > 8 * 1024 * 1024) {
        throw new StructuredReaderError(
          "limit",
          "A JSON Lines record exceeds the 8 MB per-record limit.",
        );
      }
    }

    if (reachedEnd && buffer.length > 0 && rows.length < limit) {
      addRecord(trimTrailingCR(buffer), bufferStart, lineNumber, rows, issues);
    }
    return pageResult(rows, issues, initial.rowOffset, undefined);
  }

  async close(): Promise<void> {}
}

function addRecord(
  bytes: Uint8Array,
  byteOffset: number,
  line: number,
  rows: Array<Record<string, StructuredValue>>,
  issues: StructuredPageIssue[],
): void {
  if (bytes.every((byte) => byte === 0x20 || byte === 0x09 || byte === 0x0d)) {
    return;
  }
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    issues.push({ message: "Record is not valid UTF-8.", byteOffset, line });
    rows.push({ _error: "Invalid UTF-8", _byteOffset: byteOffset });
    return;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      rows.push(normalizeValue(parsed) as Record<string, StructuredValue>);
    } else {
      rows.push({ value: normalizeValue(parsed) });
    }
  } catch (caught) {
    const message = caught instanceof Error
      ? caught.message
      : "Malformed JSON record";
    issues.push({ message, byteOffset, line });
    rows.push({
      _error: message,
      _raw: text.slice(0, 1_000),
      _byteOffset: byteOffset,
    });
  }
}

function pageResult(
  rows: Array<Record<string, StructuredValue>>,
  issues: StructuredPageIssue[],
  offset: number,
  nextCursor: string | undefined,
): StructuredPage {
  return {
    columns: Array.from(new Set(rows.flatMap((row) => Object.keys(row)))),
    rows,
    offset,
    nextCursor,
    partial: nextCursor !== undefined,
    issues,
    totalRows: undefined,
  };
}

function concatenate(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.length === 0) return right;
  const joined = new Uint8Array(left.length + right.length);
  joined.set(left);
  joined.set(right, left.length);
  return joined;
}

function trimTrailingCR(bytes: Uint8Array): Uint8Array {
  return bytes.at(-1) === 0x0d ? bytes.subarray(0, bytes.length - 1) : bytes;
}
