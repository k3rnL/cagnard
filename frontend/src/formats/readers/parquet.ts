import * as duckdb from "@duckdb/duckdb-wasm";
import duckdbMvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbMvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdbEhWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbEhWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

import type {
  StructuredField,
  StructuredFilter,
  StructuredInspection,
  StructuredPage,
  StructuredPageRequest,
  StructuredSort,
  StructuredSourceDefinition,
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

const registeredFile = "cagnard-input.parquet";
const queryTimeoutMilliseconds = 30_000;
const maximumOffset = 10_000_000;
const maximumFilters = 8;
const maximumSorts = 8;

export async function createParquetSource(
  definition: StructuredSourceDefinition,
  signal: AbortSignal,
  progress: (phase: string, loaded?: number, total?: number) => void,
): Promise<StructuredDataSource> {
  signal.throwIfAborted();
  progress("Initializing DuckDB-Wasm");
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: duckdbMvpWasm, mainWorker: duckdbMvpWorker },
    eh: { mainModule: duckdbEhWasm, mainWorker: duckdbEhWorker },
  });
  const worker = new Worker(bundle.mainWorker as string);
  const database = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  try {
    await database.instantiate(bundle.mainModule, bundle.pthreadWorker);
    await database.open({
      allowUnsignedExtensions: false,
      maximumThreads: 1,
      filesystem: {
        reliableHeadRequests: true,
        allowFullHTTPReads: false,
        forceFullHTTPReads: false,
      },
      query: {
        castBigIntToDouble: false,
        castDecimalToDouble: false,
        castTimestampToDate: false,
      },
    });
    const connection = await database.connect();
    await disableExternalExtensions(connection);
    await loadLocalParquetExtension(connection, definition.contentUrl);
    signal.throwIfAborted();
    progress("Reading Parquet metadata");
    await database.registerFileURL(
      registeredFile,
      definition.contentUrl,
      duckdb.DuckDBDataProtocol.HTTP,
      false,
    );
    const source = new ParquetSource(database, connection, worker);
    await source.initialize(signal);
    return source;
  } catch (caught) {
    await database.terminate().catch(() => undefined);
    worker.terminate();
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
    private readonly database: duckdb.AsyncDuckDB,
    private readonly connection: duckdb.AsyncDuckDBConnection,
    private readonly worker: Worker,
  ) {}

  async initialize(signal: AbortSignal): Promise<void> {
    const describe = await this.query(
      `DESCRIBE SELECT * FROM read_parquet('${registeredFile}')`,
      signal,
    );
    const describeRows = tableRows(describe);
    const parquetSchemaRows = await this.optionalQuery(
      `SELECT * FROM parquet_schema('${registeredFile}')`,
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
      `SELECT * FROM parquet_metadata('${registeredFile}')`,
      signal,
    );
    const fileMetadataRows = await this.optionalQuery(
      `SELECT * FROM parquet_file_metadata('${registeredFile}')`,
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
    } FROM read_parquet('${registeredFile}')${where}${order} LIMIT ${limit} OFFSET ${offset}`;
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
    await this.database.dropFile(registeredFile).catch(() => undefined);
    await this.database.terminate().catch(() => undefined);
    this.worker.terminate();
  }

  private async query(sql: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const cancel = () =>
      void this.connection.cancelSent().catch(() => undefined);
    signal.addEventListener("abort", cancel, { once: true });
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      cancel();
    }, queryTimeoutMilliseconds);
    try {
      const result = await this.connection.query(sql);
      signal.throwIfAborted();
      if (timedOut) {
        throw new StructuredReaderError(
          "query",
          "The Parquet query exceeded the 30 second browser limit.",
          {
            retryable: true,
          },
        );
      }
      return result;
    } catch (caught) {
      if (signal.aborted) {
        throw signal.reason ?? new DOMException("Aborted", "AbortError");
      }
      if (timedOut && !(caught instanceof StructuredReaderError)) {
        throw new StructuredReaderError(
          "query",
          "The Parquet query exceeded the 30 second browser limit.",
          {
            detail: caught instanceof Error ? caught.message : String(caught),
            retryable: true,
          },
        );
      }
      throw caught;
    } finally {
      globalThis.clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
    }
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

async function disableExternalExtensions(
  connection: duckdb.AsyncDuckDBConnection,
): Promise<void> {
  for (
    const setting of [
      "SET autoinstall_known_extensions = false",
      "SET autoload_known_extensions = false",
    ]
  ) {
    try {
      await connection.query(setting);
    } catch {
      // Older embedded builds may not expose both settings; unsigned extensions remain disabled in database.open.
    }
  }
}

async function loadLocalParquetExtension(
  connection: duckdb.AsyncDuckDBConnection,
  contentUrl: string,
): Promise<void> {
  const repository = new URL("/duckdb-extensions", contentUrl).href.replace(
    /\/$/,
    "",
  );
  await connection.query(
    `SET custom_extension_repository = ${sqlLiteral(repository)}`,
  );
  await connection.query("LOAD parquet");
}

function tableRows(
  table: { numRows: number; get(index: number): unknown },
): Array<Record<string, StructuredValue>> {
  const rows: Array<Record<string, StructuredValue>> = [];
  for (let index = 0; index < table.numRows; index += 1) {
    const normalized = normalizeValue(table.get(index));
    rows.push(
      normalized && typeof normalized === "object" &&
        !Array.isArray(normalized) && !("kind" in normalized)
        ? (normalized as Record<string, StructuredValue>)
        : { value: normalized },
    );
  }
  return rows;
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

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function sqlLiteral(value: StructuredFilter["value"]): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new StructuredReaderError(
        "malformed",
        "Filter number must be finite.",
      );
    }
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}
