import type {
  StructuredFilter,
  StructuredInspection,
  StructuredPage,
  StructuredPageRequest,
  StructuredSort,
  StructuredValue,
} from "../models";
import {
  boundedLimit,
  encodeOffsetCursor,
  parseOffsetCursor,
  StructuredReaderError,
} from "./shared";
import type { StructuredDataSource } from "./types";

const maximumSorts = 8;

export class InMemoryStructuredSource implements StructuredDataSource {
  constructor(
    private readonly inspectionValue: StructuredInspection,
    private readonly rows: Array<Record<string, StructuredValue>>,
  ) {}

  async inspect(signal: AbortSignal): Promise<StructuredInspection> {
    signal.throwIfAborted();
    return this.inspectionValue;
  }

  async page(
    request: StructuredPageRequest,
    signal: AbortSignal,
  ): Promise<StructuredPage> {
    signal.throwIfAborted();
    const capabilities = this.inspectionValue.capabilities;
    if (request.filters?.length && !capabilities.exactFilter) {
      unsupported("filtering");
    }
    if (request.sorts?.length && !capabilities.exactSort) {
      unsupported("sorting");
    }
    if ((request.sorts?.length ?? 0) > maximumSorts) {
      throw new StructuredReaderError(
        "limit",
        `Exact queries support at most ${maximumSorts} sort keys.`,
      );
    }
    if (
      new Set(request.sorts?.map((sort) => sort.column)).size !==
        (request.sorts?.length ?? 0)
    ) {
      throw new StructuredReaderError(
        "query",
        "Each sort column can be used only once.",
      );
    }
    if (request.projection?.length && !capabilities.exactProjection) {
      unsupported("projection");
    }
    let selected = request.filters?.length
      ? this.rows.filter((row) =>
        request.filters?.every((filter) => matches(row, filter))
      )
      : this.rows;
    if (request.sorts?.length) {
      selected = [...selected].sort((left, right) =>
        compareRows(left, right, request.sorts as StructuredSort[])
      );
    }
    const offset = parseOffsetCursor(
      `${this.inspectionValue.format}-memory`,
      request.cursor,
    );
    const limit = boundedLimit(request.limit);
    const pageRows = selected.slice(offset, offset + limit).map((row) =>
      project(row, request.projection)
    );
    const nextOffset = offset + pageRows.length;
    const columns = request.projection?.length
      ? request.projection
      : Array.from(new Set(pageRows.flatMap((row) => Object.keys(row))));
    return {
      columns,
      rows: pageRows,
      offset,
      nextCursor: nextOffset < selected.length
        ? encodeOffsetCursor(
          `${this.inspectionValue.format}-memory`,
          nextOffset,
        )
        : undefined,
      totalRows: selected.length,
      partial: nextOffset < selected.length,
      issues: [],
    };
  }

  async close(): Promise<void> {
    this.rows.length = 0;
  }
}

function matches(
  row: Record<string, StructuredValue>,
  filter: StructuredFilter,
): boolean {
  const value = row[filter.column];
  if (filter.operator === "is-null") {
    return value === null || value === undefined;
  }
  const expected = filter.value;
  switch (filter.operator) {
    case "eq":
      return comparable(value) === comparable(expected);
    case "neq":
      return comparable(value) !== comparable(expected);
    case "contains":
      return String(comparable(value) ?? "").toLowerCase().includes(
        String(expected ?? "").toLowerCase(),
      );
    case "gt":
      return compare(value, expected) > 0;
    case "gte":
      return compare(value, expected) >= 0;
    case "lt":
      return compare(value, expected) < 0;
    case "lte":
      return compare(value, expected) <= 0;
  }
}

function compareRows(
  left: Record<string, StructuredValue>,
  right: Record<string, StructuredValue>,
  sorts: StructuredSort[],
): number {
  for (const sort of sorts) {
    const result = compare(left[sort.column], right[sort.column]);
    if (result !== 0) return sort.direction === "desc" ? -result : result;
  }
  return 0;
}

function compare(
  left: StructuredValue | undefined,
  right: StructuredValue | undefined,
): number {
  const leftValue = comparable(left);
  const rightValue = comparable(right);
  if (leftValue === rightValue) return 0;
  if (leftValue === null || leftValue === undefined) return 1;
  if (rightValue === null || rightValue === undefined) return -1;
  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }
  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function comparable(
  value: StructuredValue | undefined,
): string | number | boolean | null | undefined {
  return value === null || value === undefined || typeof value !== "object"
    ? value
    : JSON.stringify(value);
}

function project(
  row: Record<string, StructuredValue>,
  columns: string[] | undefined,
): Record<string, StructuredValue> {
  if (!columns?.length) return row;
  return Object.fromEntries(
    columns.map((column) => [column, row[column] ?? null]),
  );
}

function unsupported(operation: string): never {
  throw new StructuredReaderError(
    "unsupported-format",
    `Exact ${operation} is not available for this format.`,
  );
}
