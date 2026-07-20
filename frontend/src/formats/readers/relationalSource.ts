import {
  Bool,
  Float64,
  Table,
  tableToIPC,
  Utf8,
  type Vector,
  vectorFromArray,
} from "apache-arrow";

import type {
  StructuredFilter,
  StructuredInspection,
  StructuredPage,
  StructuredPageRequest,
  StructuredRelationScope,
  StructuredDataLimits,
  StructuredSort,
  StructuredSourceDefinition,
  StructuredSQLRequest,
  StructuredSQLResult,
  StructuredValue,
} from "../models";
import {
  acquireDuckDBRuntime,
  setDuckDBFullHTTPReads,
  configureSourceConnection,
  configureUserQueryConnection,
  type DuckDBConnection,
  type DuckDBRuntime,
  quoteIdentifier,
  runDuckDBQuery,
  sqlLiteral,
  tableRows,
} from "./duckdbRuntime";
import {
  boundedLimit,
  encodeOffsetCursor,
  parseOffsetCursor,
  StructuredReaderError,
} from "./shared";
import { validateReadOnlySQL } from "./sqlValidation";
import type { StructuredDataSource } from "./types";

const maximumOffset = 10_000_000;
const maximumFilters = 8;
const maximumSorts = 8;

export async function addBoundedRelation(
  source: StructuredDataSource,
  definition: StructuredSourceDefinition,
  signal: AbortSignal,
  progress: (phase: string, loaded?: number, total?: number) => void,
): Promise<StructuredDataSource> {
  const relationalLimits = definition.limits.relational;
  if (definition.size !== undefined && definition.size > relationalLimits.maxIngestionBytes) {
    return source;
  }

  const inspection = await source.inspect(signal);
  if (inspection.totalRows !== undefined && inspection.totalRows > relationalLimits.maxIngestionRows) {
    return source;
  }

  const rows: Array<Record<string, StructuredValue>> = [];
  let cursor: string | undefined;
  const seenCursors = new Set<string>();
  do {
    signal.throwIfAborted();
    progress("Preparing exact queries", rows.length, inspection.totalRows);
    const page = await source.page({ cursor, limit: 500 }, signal);
    rows.push(...page.rows);
    if (rows.length > relationalLimits.maxIngestionRows) return source;
    cursor = page.nextCursor;
    if (cursor) {
      if (seenCursors.has(cursor)) {
        throw new StructuredReaderError("internal", "The source returned a repeated paging cursor.");
      }
      seenCursors.add(cursor);
    }
  } while (cursor);

  setDuckDBFullHTTPReads(definition.limits.directContentFullReads === true);
  const runtime = await acquireDuckDBRuntime(definition.contentUrl, progress);
  const connection = await runtime.database.connect();
  await configureSourceConnection(connection);
  const tableName = relationTableName(definition.sourceId);
  try {
    if (rows.length === 0) {
      const fields = inspection.schema.length > 0 ? inspection.schema : [{ name: "value" }];
      await connection.query(
        `CREATE TEMP TABLE ${quoteIdentifier(tableName)} (${
          fields.map((field) => `${quoteIdentifier(field.name)} VARCHAR`).join(", ")
        })`,
      );
    } else {
      const columns = relationColumns(inspection, rows);
      const arrays: Record<string, Vector> = Object.fromEntries(columns.map((column) => [
        column,
        buildRelationVector(rows.map((row) => arrowValue(row[column]))),
      ]));
      await connection.insertArrowFromIPCStream(tableToIPC(new Table(arrays), "stream"), {
        name: tableName,
        create: true,
      });
    }
    await connection.query(
      `CREATE OR REPLACE TEMP VIEW data AS SELECT * FROM ${quoteIdentifier(tableName)}`,
    );
    await configureUserQueryConnection(connection);
    return new RelationalStructuredSource(
      source,
      runtime,
      connection,
      relationTableName(definition.sourceId),
      rows.length,
      definition.limits,
    );
  } catch (caught) {
    await connection.close().catch(() => undefined);
    if (caught instanceof StructuredReaderError) throw caught;
    throw new StructuredReaderError(
      "query",
      "This file could not be prepared for exact structured-data queries.",
      { detail: caught instanceof Error ? caught.message : String(caught), retryable: true },
    );
  }
}

export class RelationalStructuredSource implements StructuredDataSource {
  private readonly generation = 1;
  private inspectionValue?: StructuredInspection;
  private columns = new Set<string>();

  constructor(
    private readonly source: StructuredDataSource,
    private readonly runtime: DuckDBRuntime,
    private readonly connection: DuckDBConnection,
    private readonly cursorKind: string,
    private readonly rowCount: number,
    private readonly limits: StructuredDataLimits,
  ) {}

  async inspect(signal: AbortSignal): Promise<StructuredInspection> {
    signal.throwIfAborted();
    if (this.inspectionValue) return this.inspectionValue;
    const base = await this.source.inspect(signal);
    this.columns = new Set(base.schema.map((field) => field.name));
    const relation = this.relationScope();
    this.inspectionValue = {
      ...base,
      capabilities: {
        exactCount: true,
        exactFilter: true,
        exactProjection: true,
        exactSort: true,
        pagination: "offset",
        exportCurrentPage: true,
        sql: true,
      },
      totalRows: this.rowCount,
      relation,
      warnings: [
        ...base.warnings,
        `Exact operations use a bounded DuckDB relation (${this.rowCount.toLocaleString()} rows).`,
      ],
    };
    return this.inspectionValue;
  }

  relationScope(): StructuredRelationScope {
    return {
      relation: "data",
      label: "Complete file",
      description: "The complete file is available to exact operations as data.",
      exact: true,
      bounded: true,
      rowCount: this.rowCount,
      maximumBytes: this.limits.relational.maxIngestionBytes,
      maximumRows: this.limits.relational.maxIngestionRows,
      generation: this.generation,
    };
  }

  async page(request: StructuredPageRequest, signal: AbortSignal): Promise<StructuredPage> {
    await this.inspect(signal);
    return executeRelationPage(
      this.runtime,
      this.connection,
      this.columns,
      this.cursorKind,
      request,
      signal,
    );
  }

  sql(request: StructuredSQLRequest, signal: AbortSignal): Promise<StructuredSQLResult> {
    return executeRelationSQL(
      this.runtime,
      this.connection,
      request,
      this.generation,
			this.limits.sql,
      signal,
    );
  }

  async close(): Promise<void> {
    await this.connection.close().catch(() => undefined);
    await this.source.close().catch(() => undefined);
  }
}

export async function executeRelationPage(
  runtime: DuckDBRuntime,
  connection: DuckDBConnection,
  columns: Set<string>,
  cursorKind: string,
  request: StructuredPageRequest,
  signal: AbortSignal,
): Promise<StructuredPage> {
  validatePageRequest(columns, request);
  const limit = boundedLimit(request.limit);
  const offset = parseOffsetCursor(cursorKind, request.cursor);
  if (offset > maximumOffset) throw new StructuredReaderError("limit", "The requested row offset is too large.");
  const projection = request.projection?.length ? request.projection : Array.from(columns);
  const where = request.filters?.length
    ? ` WHERE ${request.filters.map((filter) => filterSQL(filter)).join(" AND ")}`
    : "";
  const order = request.sorts?.length
    ? ` ORDER BY ${request.sorts.map(sortSQL).join(", ")}`
    : "";
  const countRows = tableRows(await runDuckDBQuery(
    runtime,
    connection,
    `SELECT count(*) AS total FROM data${where}`,
    signal,
  ));
  const totalRows = Number(countRows[0]?.total ?? 0);
  const rows = tableRows(await runDuckDBQuery(
    runtime,
    connection,
    `SELECT ${projection.map(quoteIdentifier).join(", ")} FROM data${where}${order} LIMIT ${limit} OFFSET ${offset}`,
    signal,
  ));
  const nextOffset = offset + rows.length;
  return {
    columns: projection,
    rows,
    offset,
    nextCursor: nextOffset < totalRows ? encodeOffsetCursor(cursorKind, nextOffset) : undefined,
    totalRows,
    partial: nextOffset < totalRows,
    issues: [],
  };
}

export async function executeRelationSQL(
  runtime: DuckDBRuntime,
  connection: DuckDBConnection,
  request: StructuredSQLRequest,
  generation: number,
  limits: StructuredDataLimits["sql"],
  signal: AbortSignal,
): Promise<StructuredSQLResult> {
  if (request.generation !== generation) {
    throw new StructuredReaderError("query", "The data scope changed. Run the SQL query again.");
  }
  const validated = validateReadOnlySQL(request.sql, limits.maxQueryCharacters);
  const limit = boundedLimit(request.limit);
  const cursorKind = `sql-${generation}`;
  const offset = parseOffsetCursor(cursorKind, request.cursor);
  if (offset >= limits.maxResultRows) {
    throw new StructuredReaderError("limit", `SQL results are limited to ${limits.maxResultRows.toLocaleString()} rows.`);
  }
  const pageLimit = Math.min(limit, limits.maxResultRows - offset);
  const started = performance.now();
  const internalCount = "__cagnard_total_rows_89f5";
  let rows: Array<Record<string, StructuredValue>>;
  try {
    rows = tableRows(await runDuckDBQuery(
      runtime,
      connection,
      `SELECT *, count(*) OVER () AS ${quoteIdentifier(internalCount)} FROM (${validated.sql}) AS cagnard_result LIMIT ${pageLimit} OFFSET ${offset}`,
      signal,
      {
        timeoutMilliseconds: limits.timeoutMilliseconds,
        timeoutMessage: `The SQL query exceeded the ${Math.round(limits.timeoutMilliseconds / 1_000)} second browser limit.`,
      },
    ));
  } catch (caught) {
    if (caught instanceof StructuredReaderError || signal.aborted) throw caught;
    throw new StructuredReaderError("query", "The SQL query could not be completed.", {
      detail: caught instanceof Error ? caught.message : String(caught),
    });
  }
  const totalRows = Number(rows[0]?.[internalCount] ?? 0);
  rows.forEach((row) => delete row[internalCount]);
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const nextOffset = offset + rows.length;
  return {
    page: {
      columns,
      rows,
      offset,
      nextCursor: nextOffset < Math.min(totalRows, limits.maxResultRows)
        ? encodeOffsetCursor(cursorKind, nextOffset)
        : undefined,
      totalRows: Math.min(totalRows, limits.maxResultRows),
      partial: nextOffset < totalRows,
		issues: totalRows > limits.maxResultRows
			? [{ message: `Result display is capped at ${limits.maxResultRows.toLocaleString()} rows.` }]
        : [],
    },
    elapsedMilliseconds: Math.round(performance.now() - started),
    generation,
  };
}

function validatePageRequest(columns: Set<string>, request: StructuredPageRequest): void {
  if ((request.filters?.length ?? 0) > maximumFilters) throw new StructuredReaderError("limit", `Queries support at most ${maximumFilters} filters.`);
  if ((request.sorts?.length ?? 0) > maximumSorts) throw new StructuredReaderError("limit", `Queries support at most ${maximumSorts} sort keys.`);
  const requested = [
    ...(request.projection ?? []),
    ...(request.filters ?? []).map((filter) => filter.column),
    ...(request.sorts ?? []).map((sort) => sort.column),
  ];
  requested.forEach((column) => {
    if (!columns.has(column)) throw new StructuredReaderError("query", `Unknown column '${column}'.`);
  });
  if (new Set(request.sorts?.map((sort) => sort.column)).size !== (request.sorts?.length ?? 0)) {
    throw new StructuredReaderError("query", "Each sort column can be used only once.");
  }
}

function filterSQL(filter: StructuredFilter): string {
  const column = quoteIdentifier(filter.column);
  if (filter.operator === "is-null") return `${column} IS NULL`;
  if (filter.operator === "contains") {
    return `${column}::VARCHAR ILIKE ${sqlLiteral(`%${escapeLike(String(filter.value ?? ""))}%`)} ESCAPE '\\'`;
  }
  const operation = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[filter.operator];
  return `${column} ${operation} ${sqlLiteral(filter.value)}`;
}

function sortSQL(sort: StructuredSort): string {
  return `${quoteIdentifier(sort.column)} ${sort.direction === "desc" ? "DESC" : "ASC"}`;
}

function relationColumns(
  inspection: StructuredInspection,
  rows: Array<Record<string, StructuredValue>>,
): string[] {
  return Array.from(new Set([
    ...inspection.schema.map((field) => field.name),
    ...rows.flatMap((row) => Object.keys(row)),
  ]));
}

function arrowValue(value: StructuredValue | undefined): null | boolean | number | string {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return value;
  return JSON.stringify(value);
}

export function buildRelationVector(
  values: Array<null | boolean | number | string>,
): Vector {
  const valueTypes = new Set(
    values
      .filter((value): value is boolean | number | string => value !== null)
      .map((value) => typeof value),
  );
  if (valueTypes.size !== 1) {
    return vectorFromArray(
      values.map((value) => value === null ? null : String(value)),
      new Utf8(),
    );
  }
  switch (valueTypes.values().next().value) {
    case "boolean":
      return vectorFromArray(values as Array<boolean | null>, new Bool());
    case "number":
      return vectorFromArray(values as Array<number | null>, new Float64());
    default:
      return vectorFromArray(values as Array<string | null>, new Utf8());
  }
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function relationTableName(sourceId: string): string {
  return `source_${sourceId.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 80) || "data"}`;
}
