import * as duckdb from "@duckdb/duckdb-wasm";

import type {
  StructuredField,
  StructuredFilter,
  StructuredInspection,
  StructuredPage,
  StructuredPageRequest,
  StructuredSort,
  StructuredSourceDefinition,
  StructuredSQLRequest,
  StructuredSQLResult,
  StructuredValue,
} from "../models";
import {
  boundedLimit,
  encodeOffsetCursor,
  normalizeValue,
  parseOffsetCursor,
  StructuredReaderError,
} from "./shared";
import type { StructuredDataSource } from "./types";
import { executeRelationSQL } from "./relationalSource";
import {
  acquireDuckDBRuntime,
  configureSourceConnection,
  configureUserQueryConnection,
  type DuckDBConnection,
  type DuckDBRuntime,
  invalidateDuckDBRuntime,
  isFatalDuckDBError,
  quoteIdentifier,
  runDuckDBQuery,
  shutdownDuckDBRuntime,
  sqlLiteral,
  tableRows,
} from "./duckdbRuntime";

const queryTimeoutMilliseconds = 30_000;
const maximumOffset = 10_000_000;
const maximumFilters = 8;
const maximumSorts = 8;

type ProgressReporter = (
  phase: string,
  loaded?: number,
  total?: number,
) => void;

export async function createParquetSource(
  definition: StructuredSourceDefinition,
  signal: AbortSignal,
  progress: (phase: string, loaded?: number, total?: number) => void,
): Promise<StructuredDataSource> {
  signal.throwIfAborted();
  const runtime = await acquireDuckDBRuntime(
    definition.contentUrl,
    progress,
  );
  signal.throwIfAborted();
  const registeredFile = parquetRegistrationName(definition.sourceId);
  let connection: duckdb.AsyncDuckDBConnection | undefined;
  try {
    progress("Reading Parquet metadata");
    await runtime.database.registerFileURL(
      registeredFile,
      definition.contentUrl,
      duckdb.DuckDBDataProtocol.HTTP,
      false,
    );
    connection = await runtime.database.connect();
    await configureSourceConnection(connection);
    signal.throwIfAborted();
    const source = new ParquetSource(
      runtime,
      connection,
      registeredFile,
			definition,
    );
    await source.initialize(signal);
    return source;
  } catch (caught) {
    await connection?.close().catch(() => undefined);
    await runtime.database.dropFile(registeredFile).catch(() => undefined);
    if (isFatalDuckDBError(caught)) {
      await invalidateDuckDBRuntime(runtime).catch(() => undefined);
    }
    if (caught instanceof StructuredReaderError) throw caught;
    const detail = caught instanceof Error ? caught.message : String(caught);
    const code = /range|http file|head request/i.test(detail)
      ? "range-unavailable"
      : "malformed";
    throw new StructuredReaderError(
      code,
      code === "range-unavailable"
        ? "Parquet inspection requires byte-range access from this storage provider."
        : "The Parquet file is malformed, encrypted, or unsupported.",
      { detail },
    );
  }
}

class ParquetSource implements StructuredDataSource {
  private inspectionValue?: StructuredInspection;
  private columns = new Set<string>();

  constructor(
    private readonly runtime: DuckDBRuntime,
    private readonly connection: DuckDBConnection,
    private readonly registeredFile: string,
		private readonly definition: StructuredSourceDefinition,
  ) {}

  async initialize(signal: AbortSignal): Promise<void> {
    await this.query(
      `CREATE OR REPLACE TEMP VIEW data AS SELECT * FROM read_parquet(${sqlLiteral(this.registeredFile)})`,
      signal,
    );
    const describe = await this.query(
      "DESCRIBE SELECT * FROM data",
      signal,
    );
    const describeRows = tableRows(describe);
    const parquetSchemaRows = await this.optionalQuery(
      `SELECT * FROM parquet_schema(${sqlLiteral(this.registeredFile)})`,
      signal,
    );
    const parquetSchemaByName = new Map(
      parquetSchemaRows
        .filter((row) => row.name !== undefined)
        .map((row) => [String(row.name), row]),
    );
    const schema: StructuredField[] = describeRows.map((row) => {
      const name = String(
        row.column_name ?? row.column ?? row.name ?? "column",
      );
      const parquetField = parquetSchemaByName.get(name);
      this.columns.add(name);
      return {
        name,
        physicalType: String(
          parquetField?.type ?? row.column_type ?? row.type ?? "unknown",
        ),
        logicalType: String(
          parquetField?.logical_type ?? parquetField?.converted_type ??
            row.column_type ?? row.type ?? "unknown",
        ),
        nullable:
          String(row.null ?? row.nullable ?? "YES").toUpperCase() !== "NO",
        metadata: parquetField
          ? compactMetadata({
            repetition: parquetField.repetition_type,
            precision: parquetField.precision,
            scale: parquetField.scale,
            fieldId: parquetField.field_id,
          })
          : undefined,
      };
    });
    const metadataRows = await this.optionalQuery(
      `SELECT * FROM parquet_metadata(${sqlLiteral(this.registeredFile)})`,
      signal,
    );
    const fileMetadataRows = await this.optionalQuery(
      `SELECT * FROM parquet_file_metadata(${sqlLiteral(this.registeredFile)})`,
      signal,
    );
    const rowGroupIds = new Set(
      metadataRows.map((row) =>
        String(row.row_group_id ?? row.row_group ?? "0")
      ),
    );
    const compression = Array.from(
      new Set(
        metadataRows.map((row) => row.compression).filter((
          value,
        ): value is StructuredValue => value !== undefined),
      ),
    );
    const totalRows = parquetRowCount(metadataRows);
    await configureUserQueryConnection(this.connection, { paths: [this.registeredFile] });
    this.inspectionValue = {
      format: "parquet",
      formatLabel: "Apache Parquet",
      variant: "Parquet columnar file",
      schema,
      capabilities: {
        exactCount: totalRows !== undefined,
        exactFilter: true,
        exactProjection: true,
        exactSort: true,
        pagination: "offset",
        exportCurrentPage: true,
        sql: true,
      },
      totalRows,
      metadata: [
        {
          title: "Parquet file",
          values: [
            { label: "Row groups", value: rowGroupIds.size },
            { label: "Rows", value: totalRows ?? "Unknown" },
            {
              label: "Compression",
              value: compression.length > 0
                ? compression.join(", ")
                : "Unknown",
            },
          ],
        },
        {
          title: "File metadata",
          values: Object.entries(fileMetadataRows[0] ?? {}).map((
            [label, value],
          ) => ({ label, value })),
        },
        {
          title: "Column statistics",
          values: metadataRows.slice(0, 100).map((row, index) => ({
            label: `${
              String(
                row.path_in_schema ?? row.column_id ?? `column ${index + 1}`,
              )
            } / row group ${String(row.row_group_id ?? 0)}`,
            value: normalizeValue({
              min: row.stats_min_value ?? row.stats_min,
              max: row.stats_max_value ?? row.stats_max,
              nulls: row.stats_null_count,
              compressedBytes: row.total_compressed_size,
            }),
          })),
        },
      ].filter((section) => section.values.length > 0),
      warnings: [],
      relation: {
        relation: "data",
        label: "Complete file",
        description: "The complete Parquet file is queried lazily through DuckDB.",
        exact: true,
        bounded: false,
        rowCount: totalRows,
        generation: 1,
      },
    };
  }

  async inspect(signal: AbortSignal): Promise<StructuredInspection> {
    signal.throwIfAborted();
    if (!this.inspectionValue) await this.initialize(signal);
    return this.inspectionValue as StructuredInspection;
  }

  async page(
    request: StructuredPageRequest,
    signal: AbortSignal,
  ): Promise<StructuredPage> {
    const inspection = await this.inspect(signal);
    const limit = boundedLimit(request.limit);
    const offset = parseOffsetCursor("parquet", request.cursor);
    if (offset > maximumOffset) {
      throw new StructuredReaderError(
        "limit",
        `Parquet paging is limited to an offset of ${maximumOffset.toLocaleString()} rows.`,
      );
    }
    if ((request.filters?.length ?? 0) > maximumFilters) {
      throw new StructuredReaderError(
        "limit",
        `Parquet queries support at most ${maximumFilters} filters.`,
      );
    }
    if ((request.sorts?.length ?? 0) > maximumSorts) {
      throw new StructuredReaderError(
        "limit",
        `Parquet queries support at most ${maximumSorts} sort keys.`,
      );
    }
    if (
      new Set(request.sorts?.map((sort) => sort.column)).size !==
        (request.sorts?.length ?? 0)
    ) {
      throw new StructuredReaderError(
        "query",
        "Each Parquet sort column can be used only once.",
      );
    }
    const projection = request.projection?.length
      ? request.projection
      : Array.from(this.columns);
    projection.forEach((column) => this.assertColumn(column));
    const where = request.filters?.length
      ? ` WHERE ${
        request.filters.map((filter) => this.filterSQL(filter)).join(" AND ")
      }`
      : "";
    const order = request.sorts?.length
      ? ` ORDER BY ${
        request.sorts.map((sort) => this.sortSQL(sort)).join(", ")
      }`
      : "";
    const sql = `SELECT ${
      projection.map(quoteIdentifier).join(", ")
    } FROM data${where}${order} LIMIT ${limit} OFFSET ${offset}`;
    let result;
    try {
      result = await this.query(sql, signal);
    } catch (caught) {
      if (
        caught instanceof StructuredReaderError ||
        (caught instanceof DOMException && caught.name === "AbortError")
      ) {
        throw caught;
      }
      throw new StructuredReaderError(
        "query",
        "The Parquet query could not be completed.",
        {
          detail: caught instanceof Error ? caught.message : String(caught),
          retryable: true,
        },
      );
    }
    const rows = tableRows(result);
    const nextOffset = offset + rows.length;
    return {
      columns: projection,
      rows,
      offset,
      nextCursor: rows.length === limit &&
          (inspection.totalRows === undefined ||
            nextOffset < inspection.totalRows)
        ? encodeOffsetCursor("parquet", nextOffset)
        : undefined,
      totalRows: inspection.totalRows,
      partial: rows.length === limit &&
        (inspection.totalRows === undefined ||
          nextOffset < inspection.totalRows),
      issues: [],
    };
  }

  async close(): Promise<void> {
    await this.connection.close().catch(() => undefined);
    await this.runtime.database.dropFile(this.registeredFile).catch(() => undefined);
  }

  relationScope() {
    return {
      relation: "data" as const,
      label: "Complete file",
      description: "The complete Parquet file is queried lazily through DuckDB.",
      exact: true,
      bounded: false,
      rowCount: this.inspectionValue?.totalRows,
      generation: 1,
    };
  }

  sql(request: StructuredSQLRequest, signal: AbortSignal): Promise<StructuredSQLResult> {
		return executeRelationSQL(
			this.runtime,
			this.connection,
			request,
			1,
			this.definition.limits.sql,
			signal,
		);
  }

  private async query(sql: string, signal: AbortSignal) {
    return runDuckDBQuery(this.runtime, this.connection, sql, signal, {
      timeoutMilliseconds: queryTimeoutMilliseconds,
      timeoutMessage: "The Parquet query exceeded the 30 second browser limit.",
    });
  }

  private async optionalQuery(
    sql: string,
    signal: AbortSignal,
  ): Promise<Array<Record<string, StructuredValue>>> {
    try {
      return tableRows(await this.query(sql, signal));
    } catch (caught) {
      if (signal.aborted || caught instanceof StructuredReaderError) {
        throw caught;
      }
      return [];
    }
  }

  private assertColumn(column: string): void {
    if (!this.columns.has(column)) {
      throw new StructuredReaderError(
        "malformed",
        `Unknown Parquet column '${column}'.`,
      );
    }
  }

  private filterSQL(filter: StructuredFilter): string {
    this.assertColumn(filter.column);
    const column = quoteIdentifier(filter.column);
    if (filter.operator === "is-null") return `${column} IS NULL`;
    const operation = {
      eq: "=",
      neq: "<>",
      gt: ">",
      gte: ">=",
      lt: "<",
      lte: "<=",
      contains: "LIKE",
    }[filter.operator];
    if (filter.operator === "contains") {
      return `${column} LIKE ${
        sqlLiteral(`%${escapeLike(String(filter.value ?? ""))}%`)
      } ESCAPE '\\'`;
    }
    return `${column} ${operation} ${sqlLiteral(filter.value)}`;
  }

  private sortSQL(sort: StructuredSort): string {
    this.assertColumn(sort.column);
    return `${quoteIdentifier(sort.column)} ${
      sort.direction === "desc" ? "DESC" : "ASC"
    }`;
  }
}

export function shutdownParquetRuntime(): Promise<void> {
  return shutdownDuckDBRuntime();
}

export function parquetRegistrationName(sourceId: string): string {
  const safe = sourceId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96) ||
    "source";
  return `cagnard-${safe}.parquet`;
}

function compactMetadata(
  values: Record<string, StructuredValue | undefined>,
): Record<string, string> | undefined {
  const entries = Object.entries(values)
    .filter((entry): entry is [string, StructuredValue] =>
      entry[1] !== undefined && entry[1] !== null
    )
    .map((
      [key, value],
    ) => [
      key,
      typeof value === "object" ? JSON.stringify(value) : String(value),
    ]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll(
    "_",
    "\\_",
  );
}

function parquetRowCount(
  rows: Array<Record<string, StructuredValue>>,
): number | undefined {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const group = String(row.row_group_id ?? row.row_group ?? "0");
    const count = Number(row.row_group_num_rows ?? row.num_rows);
    if (Number.isFinite(count)) counts.set(group, count);
  });
  if (counts.size === 0) return undefined;
  return Array.from(counts.values()).reduce((total, count) => total + count, 0);
}
