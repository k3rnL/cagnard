import { describe, expect, it, vi } from "vitest";

import type { StructuredDataLimits, StructuredSQLRequest } from "../models";
import type { DuckDBConnection, DuckDBRuntime } from "./duckdbRuntime";
import { buildRelationVector, executeRelationSQL } from "./relationalSource";
import { encodeOffsetCursor } from "./shared";

const sqlLimits: StructuredDataLimits["sql"] = {
  timeoutMilliseconds: 1_000,
  maxResultRows: 3,
  maxQueryCharacters: 1_000,
};

describe("bounded relation SQL execution", () => {
  it("returns typed pages without exposing its internal count column", async () => {
    const query = vi.fn(async () => table([
      { category: "alpha", total: 4, __cagnard_total_rows_89f5: 5 },
      { category: "beta", total: 2, __cagnard_total_rows_89f5: 5 },
    ]));
    const connection = fakeConnection(query);

    const result = await executeRelationSQL(
      {} as DuckDBRuntime,
      connection,
      request("SELECT category, count(*) AS total FROM data GROUP BY category", 2),
      7,
      sqlLimits,
      new AbortController().signal,
    );

    expect(query).toHaveBeenCalledWith(expect.stringContaining("LIMIT 2 OFFSET 0"));
    expect(result.page.rows).toEqual([
      { category: "alpha", total: 4 },
      { category: "beta", total: 2 },
    ]);
    expect(result.page.totalRows).toBe(3);
    expect(result.page.issues[0]?.message).toMatch(/capped at 3/i);
    expect(result.page.nextCursor).toBeDefined();
  });

  it("clamps the last page to the configured result ceiling", async () => {
    const query = vi.fn(async () => table([
      { id: 3, __cagnard_total_rows_89f5: 10 },
    ]));
    const result = await executeRelationSQL(
      {} as DuckDBRuntime,
      fakeConnection(query),
      {
        ...request("SELECT id FROM data ORDER BY id", 50),
        cursor: encodeOffsetCursor("sql-7", 2),
      },
      7,
      sqlLimits,
      new AbortController().signal,
    );

    expect(query).toHaveBeenCalledWith(expect.stringContaining("LIMIT 1 OFFSET 2"));
    expect(result.page.nextCursor).toBeUndefined();
    expect(result.page.totalRows).toBe(3);
  });

  it("rejects stale generations and exhausted cursors before querying", async () => {
    const query = vi.fn(async () => table([]));
    const connection = fakeConnection(query);

    await expect(executeRelationSQL(
      {} as DuckDBRuntime,
      connection,
      request("SELECT * FROM data", 50, 6),
      7,
      sqlLimits,
      new AbortController().signal,
    )).rejects.toThrow(/scope changed/i);

    await expect(executeRelationSQL(
      {} as DuckDBRuntime,
      connection,
      { ...request("SELECT * FROM data", 50), cursor: encodeOffsetCursor("sql-7", 3) },
      7,
      sqlLimits,
      new AbortController().signal,
    )).rejects.toThrow(/limited to 3/i);
    expect(query).not.toHaveBeenCalled();
  });

  it("interrupts only the canceled connection", async () => {
    let rejectQuery: ((reason: Error) => void) | undefined;
    const query = vi.fn(() => new Promise<ReturnType<typeof table>>((_, reject) => {
      rejectQuery = reject;
    }));
    const cancelSent = vi.fn(async () => {
      rejectQuery?.(new Error("interrupted"));
    });
    const connection = fakeConnection(query, cancelSent);
    const controller = new AbortController();

    const pending = executeRelationSQL(
      {} as DuckDBRuntime,
      connection,
      request("SELECT * FROM data", 50),
      7,
      sqlLimits,
      controller.signal,
    );
    controller.abort(new DOMException("Canceled", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelSent).toHaveBeenCalledOnce();
  });
});

describe("bounded relation column binding", () => {
  it("preserves homogeneous scalar columns", () => {
    expect(Array.from(buildRelationVector([true, false, null]))).toEqual([
      true,
      false,
      null,
    ]);
    expect(Array.from(buildRelationVector([1, 2.5, null]))).toEqual([
      1,
      2.5,
      null,
    ]);
  });

  it("normalizes mixed Avro unions and all-null columns to stable text vectors", () => {
    expect(Array.from(buildRelationVector([1, "choice-2", null]))).toEqual([
      "1",
      "choice-2",
      null,
    ]);
    expect(Array.from(buildRelationVector([null, null]))).toEqual([null, null]);
  });
});

function request(sql: string, limit: number, generation = 7): StructuredSQLRequest {
  return { sql, limit, generation };
}

function table(rows: Array<Record<string, unknown>>) {
  return {
    numRows: rows.length,
    get: (index: number) => rows[index],
  };
}

function fakeConnection(
  query: (...args: unknown[]) => Promise<ReturnType<typeof table>>,
  cancelSent = vi.fn(async () => undefined),
): DuckDBConnection {
  return { query, cancelSent } as unknown as DuckDBConnection;
}
