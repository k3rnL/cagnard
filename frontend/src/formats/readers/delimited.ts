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
  parseSequentialCursor,
  StructuredReaderError,
} from "./shared";
import type { StructuredDataSource } from "./types";

const chunkBytes = 256 * 1024;
const maxRecordBytes = 8 * 1024 * 1024;

export async function createDelimitedSource(
  definition: StructuredSourceDefinition,
): Promise<StructuredDataSource> {
  return new DelimitedSource(definition);
}

class DelimitedSource implements StructuredDataSource {
  private delimiter?: number;
  private delimiterLabel = "Unknown";
  private delimiterSource: "configured" | "detected" | "extension" = "detected";
  private delimiterAmbiguous = false;
  private readonly usesHeader: boolean;
  private headers?: string[];
  private dataStart = 0;
  private inspection?: StructuredInspection;

  constructor(private readonly definition: StructuredSourceDefinition) {
    this.usesHeader = definition.options?.header ?? true;
    if (definition.options?.delimiter) {
      this.setDelimiter(
        definition.options.delimiter.charCodeAt(0),
        "configured",
      );
    } else if (
      definition.name.toLowerCase().endsWith(".tsv") ||
      definition.mimeType === "text/tab-separated-values"
    ) {
      this.setDelimiter(0x09, "extension");
    }
  }

  async inspect(signal: AbortSignal): Promise<StructuredInspection> {
    if (this.inspection) return this.inspection;
    await this.ensureHeaders(signal);
    this.inspection = {
      format: "delimited-text",
      formatLabel: this.delimiter === 0x09 ? "TSV" : "Delimited text",
      variant: "UTF-8 delimited text",
      schema: (this.headers ?? []).map((name) => ({
        name,
        physicalType: "string",
        nullable: true,
      })),
      capabilities: {
        exactCount: false,
        exactFilter: false,
        exactProjection: false,
        exactSort: false,
        pagination: "cursor",
        exportCurrentPage: true,
        sql: false,
      },
      metadata: [
        {
          title: "Dialect",
          values: [
            { label: "Delimiter", value: this.delimiterLabel },
            { label: "Interpretation", value: this.delimiterSource },
            {
              label: "Detection",
              value: this.delimiterAmbiguous ? "Ambiguous" : "Confident",
            },
            { label: "Quote", value: "Double quote" },
            { label: "Escape", value: "Doubled quote" },
            {
              label: "Header",
              value: this.usesHeader ? "First record" : "No header",
            },
            { label: "Encoding", value: "UTF-8" },
          ],
        },
      ],
      warnings: this.delimiterAmbiguous
        ? [
          "Delimiter detection was ambiguous. Choose the delimiter explicitly if the rows do not look correct.",
        ]
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
        "Global filtering, sorting, and projection are not available for delimited text.",
      );
    }
    await this.ensureHeaders(signal);
    const cursor = parseSequentialCursor("delimited", request.cursor, {
      byteOffset: this.dataStart,
      rowOffset: 0,
    });
    const parsed = await this.readRecords(
      cursor.byteOffset,
      boundedLimit(request.limit),
      signal,
    );
    const headers = this.headers ?? [];
    const rows = parsed.records.map((record) =>
      Object.fromEntries(
        headers.map((header, index) => [header, record[index] ?? null]),
      ) as Record<string, StructuredValue>
    );
    if (
      parsed.records.some((record) => record.length > headers.length) &&
      !headers.includes("_extra")
    ) {
      rows.forEach((row, index) => {
        const extra = parsed.records[index].slice(headers.length);
        if (extra.length > 0) row._extra = extra;
      });
    }
    return {
      columns: [
        ...headers,
        ...(rows.some((row) => "_extra" in row) ? ["_extra"] : []),
      ],
      rows,
      offset: cursor.rowOffset,
      nextCursor: parsed.nextByteOffset === undefined
        ? undefined
        : encodeSequentialCursor("delimited", {
          byteOffset: parsed.nextByteOffset,
          rowOffset: cursor.rowOffset + rows.length,
        }),
      partial: parsed.nextByteOffset !== undefined,
      issues: parsed.issues,
    };
  }

  async close(): Promise<void> {}

  private async ensureHeaders(signal: AbortSignal): Promise<void> {
    if (this.headers) return;
    await this.ensureDelimiter(signal);
    const parsed = await this.readRecords(0, 1, signal);
    const first = parsed.records[0];
    if (!first) {
      throw new StructuredReaderError(
        "malformed",
        "The delimited file does not contain a record.",
      );
    }
    this.headers = this.usesHeader
      ? uniqueHeaders(first)
      : first.map((_, index) => `column_${index + 1}`);
    this.dataStart = this.usesHeader
      ? parsed.nextByteOffset ?? this.definition.size ?? 0
      : 0;
  }

  private async ensureDelimiter(signal: AbortSignal): Promise<void> {
    if (this.delimiter !== undefined) return;
    const sample = await fetchByteRange(
      this.definition.contentUrl,
      0,
      64 * 1024,
      signal,
    );
    const detected = detectDelimiter(sample.bytes);
    this.delimiterAmbiguous = detected.ambiguous;
    this.setDelimiter(detected.delimiter, "detected");
  }

  private setDelimiter(
    delimiter: number,
    source: "configured" | "detected" | "extension",
  ): void {
    this.delimiter = delimiter;
    this.delimiterSource = source;
    this.delimiterLabel = delimiter === 0x09
      ? "Tab"
      : delimiter === 0x3b
      ? "Semicolon"
      : delimiter === 0x7c
      ? "Pipe"
      : "Comma";
  }

  private async readRecords(
    start: number,
    limit: number,
    signal: AbortSignal,
  ): Promise<ParsedRecords> {
    const records: string[][] = [];
    const issues: StructuredPageIssue[] = [];
    let fetchOffset = start;
    let knownTotal = this.definition.size;
    let recordStart = start;
    let fieldBytes: number[] = [];
    let fields: string[] = [];
    let inQuotes = false;
    let quotePending = false;
    let reachedEnd = false;

    const finishField = () => {
      fields.push(decodeField(fieldBytes, recordStart, issues));
      fieldBytes = [];
    };
    const finishRecord = (nextOffset: number): number | undefined => {
      finishField();
      records.push(fields);
      fields = [];
      recordStart = nextOffset;
      if (records.length >= limit) return nextOffset;
      return undefined;
    };

    while (!reachedEnd) {
      const response = await fetchByteRange(
        this.definition.contentUrl,
        fetchOffset,
        chunkBytes,
        signal,
      );
      if (response.total !== undefined) knownTotal = response.total;
      if (response.bytes.length === 0) break;
      for (let index = 0; index < response.bytes.length; index += 1) {
        const byte = response.bytes[index];
        const absoluteOffset = response.start + index;
        if (quotePending) {
          if (byte === 0x22) {
            fieldBytes.push(0x22);
            quotePending = false;
            continue;
          }
          inQuotes = false;
          quotePending = false;
        }
        if (inQuotes) {
          if (byte === 0x22) quotePending = true;
          else fieldBytes.push(byte);
          continue;
        }
        if (byte === 0x22 && fieldBytes.length === 0) {
          inQuotes = true;
          continue;
        }
        if (byte === this.delimiter) {
          finishField();
          continue;
        }
        if (byte === 0x0a) {
          if (fieldBytes.at(-1) === 0x0d) fieldBytes.pop();
          const nextByteOffset = finishRecord(absoluteOffset + 1);
          if (nextByteOffset !== undefined) {
            return { records, issues, nextByteOffset };
          }
          continue;
        }
        fieldBytes.push(byte);
        if (absoluteOffset - recordStart > maxRecordBytes) {
          throw new StructuredReaderError(
            "limit",
            "A delimited-text record exceeds the 8 MB per-record limit.",
          );
        }
      }
      fetchOffset = response.end + 1;
      reachedEnd = (knownTotal !== undefined && fetchOffset >= knownTotal) ||
        response.bytes.length < chunkBytes || !response.partial;
    }

    if (inQuotes && !quotePending) {
      issues.push({
        message: "The final record has an unterminated quoted field.",
        byteOffset: recordStart,
      });
    }
    if (fieldBytes.length > 0 || fields.length > 0 || quotePending) {
      finishRecord(fetchOffset);
    }
    return { records, issues, nextByteOffset: undefined };
  }
}

function detectDelimiter(
  bytes: Uint8Array,
): { delimiter: number; ambiguous: boolean } {
  const candidates = [0x2c, 0x09, 0x3b, 0x7c];
  const counts = new Map(candidates.map((candidate) => [candidate, 0]));
  let inQuotes = false;
  let rows = 0;
  for (let index = 0; index < bytes.length && rows < 12; index += 1) {
    const byte = bytes[index];
    if (byte === 0x22) {
      if (inQuotes && bytes[index + 1] === 0x22) index += 1;
      else inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (byte === 0x0a) {
      rows += 1;
      continue;
    }
    if (counts.has(byte)) counts.set(byte, (counts.get(byte) ?? 0) + 1);
  }
  const ranked = candidates
    .map((delimiter) => ({ delimiter, count: counts.get(delimiter) ?? 0 }))
    .sort((left, right) =>
      right.count - left.count ||
      candidates.indexOf(left.delimiter) - candidates.indexOf(right.delimiter)
    );
  return {
    delimiter: ranked[0].delimiter,
    ambiguous: ranked[0].count === 0 || ranked[0].count === ranked[1].count,
  };
}

interface ParsedRecords {
  records: string[][];
  issues: StructuredPageIssue[];
  nextByteOffset?: number;
}

function decodeField(
  bytes: number[],
  byteOffset: number,
  issues: StructuredPageIssue[],
): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(bytes),
    );
  } catch {
    issues.push({ message: "A field is not valid UTF-8.", byteOffset });
    return new TextDecoder().decode(Uint8Array.from(bytes));
  }
}

function uniqueHeaders(values: string[]): string[] {
  const counts = new Map<string, number>();
  return values.map((value, index) => {
    const base = value.trim() || `column_${index + 1}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}
