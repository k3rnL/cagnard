import * as duckdb from "@duckdb/duckdb-wasm";
import duckdbMvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbMvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdbEhWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbEhWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

import type { StructuredFilter, StructuredValue } from "../models";
import { normalizeValue, StructuredReaderError } from "./shared";
import { LazyRuntime } from "./lazyRuntime";

export const duckDBQueryTimeoutMilliseconds = 30_000;

export interface DuckDBRuntime {
  database: duckdb.AsyncDuckDB;
  worker: Worker;
  extensionRepository: string;
}

export type DuckDBConnection = duckdb.AsyncDuckDBConnection;
export type DuckDBProgressReporter = (
  phase: string,
  loaded?: number,
  total?: number,
) => void;

const sharedRuntime = new LazyRuntime<
  DuckDBRuntime,
  [contentUrl: string, progress: DuckDBProgressReporter]
>(createRuntime, disposeRuntime);

export function acquireDuckDBRuntime(
  contentUrl: string,
  progress: DuckDBProgressReporter,
): Promise<DuckDBRuntime> {
  return sharedRuntime.get(contentUrl, progress);
}

export function invalidateDuckDBRuntime(runtime: DuckDBRuntime): Promise<void> {
  return sharedRuntime.invalidate(runtime);
}

export function shutdownDuckDBRuntime(): Promise<void> {
  return sharedRuntime.shutdown();
}

export async function runDuckDBQuery(
  runtime: DuckDBRuntime,
  connection: DuckDBConnection,
  sql: string,
  signal: AbortSignal,
  options: { timeoutMilliseconds?: number; timeoutMessage?: string } = {},
) {
  signal.throwIfAborted();
  const cancel = () => void connection.cancelSent().catch(() => undefined);
  signal.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timeoutMilliseconds = options.timeoutMilliseconds ??
    duckDBQueryTimeoutMilliseconds;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    cancel();
  }, timeoutMilliseconds);
  try {
    const result = await connection.query(sql);
    signal.throwIfAborted();
    if (timedOut) throw queryTimeout(timeoutMilliseconds, options.timeoutMessage);
    return result;
  } catch (caught) {
    if (signal.aborted) {
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    if (timedOut && !(caught instanceof StructuredReaderError)) {
      throw queryTimeout(
        timeoutMilliseconds,
        options.timeoutMessage,
        caught instanceof Error ? caught.message : String(caught),
      );
    }
    if (isFatalDuckDBError(caught)) {
      await sharedRuntime.invalidate(runtime).catch(() => undefined);
    }
    throw caught;
  } finally {
    globalThis.clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}

export async function configureSourceConnection(
  connection: DuckDBConnection,
): Promise<void> {
  try {
    await connection.query("SET autoinstall_known_extensions = false");
    await connection.query("SET autoload_known_extensions = false");
  } catch (caught) {
    throw new StructuredReaderError(
      "internal",
      "The embedded query engine could not apply its extension security policy.",
      { detail: caught instanceof Error ? caught.message : String(caught) },
    );
  }
}

export async function configureUserQueryConnection(
  connection: DuckDBConnection,
  allowed: { paths?: string[]; directories?: string[] } = {},
): Promise<void> {
  await configureSourceConnection(connection);
  try {
    if (allowed.paths?.length) {
      await connection.query(`SET allowed_paths = [${allowed.paths.map(sqlLiteral).join(", ")}]`);
    }
    if (allowed.directories?.length) {
      await connection.query(`SET allowed_directories = [${allowed.directories.map(sqlLiteral).join(", ")}]`);
    }
    await connection.query("SET enable_external_access = false");
  } catch (caught) {
    throw new StructuredReaderError(
      "internal",
      "The embedded query engine could not isolate the SQL workspace.",
      { detail: caught instanceof Error ? caught.message : String(caught) },
    );
  }
}

export async function loadIcebergExtension(
  runtime: DuckDBRuntime,
  connection: DuckDBConnection,
): Promise<void> {
  await connection.query(
    `SET custom_extension_repository = ${sqlLiteral(runtime.extensionRepository)}`,
  );
  await connection.query("LOAD iceberg");
}

export function tableRows(
  table: { numRows: number; get(index: number): unknown },
): Array<Record<string, StructuredValue>> {
  const rows: Array<Record<string, StructuredValue>> = [];
  for (let index = 0; index < table.numRows; index += 1) {
    const normalized = normalizeValue(table.get(index));
    rows.push(
      normalized && typeof normalized === "object" &&
          !Array.isArray(normalized) && !("kind" in normalized)
        ? normalized as Record<string, StructuredValue>
        : { value: normalized },
    );
  }
  return rows;
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function sqlLiteral(value: StructuredFilter["value"]): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new StructuredReaderError("malformed", "Query numbers must be finite.");
    }
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function isFatalDuckDBError(caught: unknown): boolean {
  const detail = caught instanceof Error ? caught.message : String(caught);
  return /duckdb.*(?:terminated|closed)|worker.*(?:terminated|stopped|crashed)|database.*(?:terminated|closed)/i
    .test(detail);
}

async function createRuntime(
  contentUrl: string,
  progress: DuckDBProgressReporter,
): Promise<DuckDBRuntime> {
  progress("Initializing DuckDB-Wasm");
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: duckdbMvpWasm, mainWorker: duckdbMvpWorker },
    eh: { mainModule: duckdbEhWasm, mainWorker: duckdbEhWorker },
  });
  const worker = new Worker(bundle.mainWorker as string);
  const database = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  const extensionRepository = new URL("/duckdb-extensions", contentUrl).href
    .replace(/\/$/, "");
  const runtime = { database, worker, extensionRepository };
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
    const bootstrap = await database.connect();
    try {
      await configureSourceConnection(bootstrap);
      await bootstrap.query(
        `SET custom_extension_repository = ${sqlLiteral(extensionRepository)}`,
      );
      await bootstrap.query("LOAD parquet");
    } finally {
      await bootstrap.close().catch(() => undefined);
    }
    return runtime;
  } catch (caught) {
    await disposeRuntime(runtime);
    throw caught;
  }
}

async function disposeRuntime(runtime: DuckDBRuntime): Promise<void> {
  await runtime.database.terminate().catch(() => undefined);
  runtime.worker.terminate();
}

function queryTimeout(
  timeoutMilliseconds: number,
  message?: string,
  detail?: string,
): StructuredReaderError {
  return new StructuredReaderError(
    "query",
    message ?? `The query exceeded the ${Math.round(timeoutMilliseconds / 1_000)} second browser limit.`,
    { detail, retryable: true },
  );
}
