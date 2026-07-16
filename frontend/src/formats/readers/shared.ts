import type { StructuredErrorCode, StructuredErrorShape, StructuredField, StructuredValue } from "../models";

const binaryPreviewBytes = 24;

export class StructuredReaderError extends Error {
  readonly shape: StructuredErrorShape;

  constructor(code: StructuredErrorCode, message: string, options: { detail?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = "StructuredReaderError";
    this.shape = { code, message, detail: options.detail, retryable: options.retryable ?? false };
  }
}

export function normalizeReaderError(caught: unknown): StructuredErrorShape {
  if (caught instanceof StructuredReaderError) return caught.shape;
  if (caught instanceof DOMException && caught.name === "AbortError") {
    return { code: "aborted", message: "The operation was canceled.", retryable: true };
  }
  const detail = caught instanceof Error ? caught.message : String(caught);
  if (/401|403|unauthor|forbidden/i.test(detail)) {
    return { code: "authorization", message: "Access to this file was denied.", detail, retryable: false };
  }
  if (/fetch|network|load failed/i.test(detail)) {
    return { code: "network", message: "The file could not be read from storage.", detail, retryable: true };
  }
  return { code: "internal", message: "The file viewer encountered an unexpected error.", detail, retryable: true };
}

export function normalizeValue(value: unknown, depth = 0): StructuredValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) {
    const preview = value.subarray(0, binaryPreviewBytes);
    return {
      kind: "binary",
      byteLength: value.byteLength,
      preview: Array.from(preview, (byte) => byte.toString(16).padStart(2, "0")).join(" "),
      truncated: value.byteLength > preview.length
    };
  }
  if (depth >= 8) return "[maximum nesting depth]";
  if (Array.isArray(value)) return value.slice(0, 1_000).map((item) => normalizeValue(item, depth + 1));
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries(), ([key, item]) => [String(key), normalizeValue(item, depth + 1)])
    );
  }
  if (typeof value === "object") {
    const candidate = value as { toJSON?: () => unknown };
    if (typeof candidate.toJSON === "function") return normalizeValue(candidate.toJSON(), depth + 1);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 1_000)
        .map(([key, item]) => [key, normalizeValue(item, depth + 1)])
    );
  }
  return String(value);
}

export function inferSchema(rows: Array<Record<string, StructuredValue>>): StructuredField[] {
  const names = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return names.map((name) => {
    const values = rows.map((row) => row[name]);
    const nonNull = values.find((value) => value !== null && value !== undefined);
    return {
      name,
      physicalType: valueType(nonNull),
      nullable: values.some((value) => value === null || value === undefined),
      children: nestedFields(nonNull)
    };
  });
}

function valueType(value: StructuredValue | undefined): string {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) return "list";
  if (typeof value === "object") return "kind" in value && value.kind === "binary" ? "binary" : "struct";
  return typeof value;
}

function nestedFields(value: StructuredValue | undefined): StructuredField[] | undefined {
  if (!value || Array.isArray(value) || typeof value !== "object" || ("kind" in value && value.kind === "binary")) {
    return undefined;
  }
  return Object.entries(value).map(([name, child]) => ({
    name,
    physicalType: valueType(child),
    nullable: child === null,
    children: nestedFields(child)
  }));
}

export function encodeOffsetCursor(kind: string, offset: number): string {
  return `${kind}:${offset.toString(36)}`;
}

export function parseOffsetCursor(kind: string, cursor: string | undefined): number {
  if (!cursor) return 0;
  const [actualKind, encodedOffset, ...extra] = cursor.split(":");
  const parsed = /^[0-9a-z]+$/i.test(encodedOffset ?? "") ? Number.parseInt(encodedOffset, 36) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new StructuredReaderError("malformed", "The page cursor is invalid.");
  }
  if (actualKind !== kind || extra.length > 0) {
    throw new StructuredReaderError("malformed", "The page cursor is invalid.");
  }
  return parsed;
}

export interface SequentialCursor {
  byteOffset: number;
  rowOffset: number;
  line?: number;
}

export function encodeSequentialCursor(kind: string, cursor: SequentialCursor): string {
  const parts = [kind, cursor.byteOffset, cursor.rowOffset];
  if (cursor.line !== undefined) parts.push(cursor.line);
  return parts.join(":");
}

export function parseSequentialCursor(
  kind: string,
  value: string | undefined,
  fallback: SequentialCursor
): SequentialCursor {
  if (!value) return fallback;
  const [actualKind, byteOffsetValue, rowOffsetValue, lineValue, ...extra] = value.split(":");
  const byteOffset = Number(byteOffsetValue);
  const rowOffset = Number(rowOffsetValue);
  const line = lineValue === undefined ? undefined : Number(lineValue);
  if (
    actualKind !== kind ||
    extra.length > 0 ||
    !Number.isSafeInteger(byteOffset) ||
    byteOffset < 0 ||
    !Number.isSafeInteger(rowOffset) ||
    rowOffset < 0 ||
    (line !== undefined && (!Number.isSafeInteger(line) || line < 1))
  ) {
    throw new StructuredReaderError("malformed", "The page cursor is invalid.");
  }
  return { byteOffset, rowOffset, line };
}

export function boundedLimit(limit: number): number {
  return Math.max(1, Math.min(500, Math.floor(limit || 100)));
}
