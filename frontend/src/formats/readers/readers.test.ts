import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createArrowSource } from "./arrow";
import { createAvroSource } from "./avro";
import { createDelimitedSource } from "./delimited";
import { InMemoryStructuredSource } from "./inMemory";
import { createNDJSONSource } from "./ndjson";
import { fetchBoundedFile } from "./rangeFetch";
import { defaultStructuredDataLimits } from "../config";

const fixtureRoot = new URL(
  "../../../../examples/storage/global/structured-data/",
  import.meta.url,
);

afterEach(() => vi.unstubAllGlobals());

describe("structured format readers", () => {
  it("combines exact filter conditions with AND semantics", async () => {
    const source = new InMemoryStructuredSource({
      format: "arrow-ipc",
      formatLabel: "Arrow",
      schema: [
        { name: "active", physicalType: "BOOLEAN", nullable: false },
        { name: "score", physicalType: "INT64", nullable: false },
      ],
      capabilities: {
        exactCount: true,
        exactFilter: true,
        exactProjection: true,
        exactSort: true,
        pagination: "offset",
        exportCurrentPage: true,
        sql: false,
      },
      metadata: [],
      warnings: [],
    }, [
      { active: true, score: 5 },
      { active: false, score: 20 },
      { active: true, score: 30 },
    ]);

    const page = await source.page({
      limit: 20,
      filters: [
        { column: "active", operator: "eq", value: true },
        { column: "score", operator: "gt", value: 10 },
      ],
    }, new AbortController().signal);

    expect(page.rows).toEqual([{ active: true, score: 30 }]);
    expect(page.totalRows).toBe(1);
  });

  it("applies ordered sort keys with later keys breaking ties", async () => {
    const source = new InMemoryStructuredSource({
      format: "arrow-ipc",
      formatLabel: "Arrow",
      schema: [
        { name: "group", physicalType: "VARCHAR", nullable: false },
        { name: "score", physicalType: "INT64", nullable: false },
      ],
      capabilities: {
        exactCount: true,
        exactFilter: true,
        exactProjection: true,
        exactSort: true,
        pagination: "offset",
        exportCurrentPage: true,
        sql: false,
      },
      metadata: [],
      warnings: [],
    }, [
      { group: "beta", score: 2 },
      { group: "alpha", score: 1 },
      { group: "alpha", score: 3 },
      { group: "beta", score: 1 },
    ]);

    const page = await source.page({
      limit: 20,
      sorts: [
        { column: "group", direction: "asc" },
        { column: "score", direction: "desc" },
      ],
    }, new AbortController().signal);

    expect(page.rows).toEqual([
      { group: "alpha", score: 3 },
      { group: "alpha", score: 1 },
      { group: "beta", score: 2 },
      { group: "beta", score: 1 },
    ]);
    await expect(source.page({
      limit: 20,
      sorts: [
        { column: "group", direction: "asc" },
        { column: "group", direction: "desc" },
      ],
    }, new AbortController().signal)).rejects.toMatchObject({
      shape: { code: "query" },
    });
  });

  it.each(["events-null.avro", "events-deflate.avro", "events-snappy.avro"])(
    "decodes Avro OCF codec fixture %s",
    async (name) => {
      const bytes = new Uint8Array(await readFile(new URL(name, fixtureRoot)));
      stubFileFetch(bytes);
      const source = await createAvroSource(
        definition("avro", name, bytes.length),
        new AbortController().signal,
        () => undefined,
      );
      const inspection = await source.inspect(new AbortController().signal);
      const page = await source.page(
        { limit: 25 },
        new AbortController().signal,
      );
      expect(inspection.totalRows).toBe(2400);
      expect(inspection.schema.map((field) => field.name)).toContain("profile");
      expect(inspection.capabilities.exactSort).toBe(false);
      expect(page.rows).toHaveLength(25);
      expect(
        inspection.schema.find((field) => field.name === "created_at")
          ?.logicalType,
      ).toBe("timestamp-millis");
      expect(
        inspection.schema.find((field) => field.name === "choice")?.children
          ?.map((field) => field.physicalType),
      ).toEqual(["long", "string"]);
      expect(page.rows[0].payload).toMatchObject({
        kind: "binary",
        byteLength: 3,
      });
      expect(page.rows[0].fingerprint).toMatchObject({
        kind: "binary",
        byteLength: 4,
      });
      expect(page.rows[0].attributes).toEqual({
        source: "fixture",
        partition: "0",
      });
      expect(page.nextCursor).toMatch(/^avro:/);
      const second = await source.page(
        { limit: 25, cursor: page.nextCursor },
        new AbortController().signal,
      );
      expect(second.rows[0].id).toBe(26);
    },
  );

  it.each(["events.arrow", "events.feather"])(
    "decodes buffered Arrow fixture %s",
    async (name) => {
      const bytes = new Uint8Array(await readFile(new URL(name, fixtureRoot)));
      stubFileFetch(bytes);
      const source = await createArrowSource(
        definition("arrow-ipc", name, bytes.length),
        new AbortController().signal,
        () => undefined,
      );
      const inspection = await source.inspect(new AbortController().signal);
      const page = await source.page(
        { limit: 40 },
        new AbortController().signal,
      );
      expect(inspection.totalRows).toBe(2400);
      expect(
        inspection.schema.find((field) => field.name === "profile")?.children
          ?.map((field) => field.name),
      ).toEqual(["city", "level"]);
      expect(
        inspection.schema.find((field) => field.name === "category")
          ?.physicalType,
      ).toContain("Dictionary");
      expect(page.rows).toHaveLength(40);
      expect(page.columns).toContain("category");
      expect(page.nextCursor).toMatch(/^arrow-ipc-memory:/);
      await expect(
        source.page(
          { limit: 40, cursor: "arrow-ipc-memory:not-a-number" },
          new AbortController().signal,
        ),
      )
        .rejects.toMatchObject({ shape: { code: "malformed" } });
    },
  );

  it("consumes Arrow IPC stream batches incrementally with an unknown count until completion", async () => {
    const name = "events.ipc";
    const bytes = new Uint8Array(await readFile(new URL(name, fixtureRoot)));
    stubFileFetch(bytes);
    const source = await createArrowSource(
      definition("arrow-ipc", name, bytes.length),
      new AbortController().signal,
      () => undefined,
    );
    const inspection = await source.inspect(new AbortController().signal);
    expect(inspection.totalRows).toBeUndefined();
    expect(inspection.capabilities.exactCount).toBe(false);
    let cursor: string | undefined;
    let rows = 0;
    do {
      const page = await source.page(
        { limit: 100, cursor },
        new AbortController().signal,
      );
      if (page.nextCursor) expect(page.nextCursor).toMatch(/^arrow-stream:/);
      rows += page.rows.length;
      cursor = page.nextCursor;
      if (!cursor) expect(page.totalRows).toBe(2400);
    } while (cursor);
    expect(rows).toBe(2400);
  });

  it("pages NDJSON at record-safe byte offsets", async () => {
    const bytes = new Uint8Array(
      await readFile(new URL("events.ndjson", fixtureRoot)),
    );
    stubFileFetch(bytes);
    const source = await createNDJSONSource(
      definition("ndjson", "events.ndjson", bytes.length),
    );
    const first = await source.page(
      { limit: 30 },
      new AbortController().signal,
    );
    const second = await source.page(
      { limit: 30, cursor: first.nextCursor },
      new AbortController().signal,
    );
    expect(first.rows).toHaveLength(30);
    expect(second.rows).toHaveLength(30);
    expect(second.rows[0].id).toBe(31);
    expect(second.offset).toBe(30);
  });

  it("preserves multibyte UTF-8 and blank CRLF lines across NDJSON range boundaries", async () => {
    const bytes = new Uint8Array(
      await readFile(new URL("events-utf8-boundary.ndjson", fixtureRoot)),
    );
    stubFileFetch(bytes);
    const source = await createNDJSONSource(
      definition("ndjson", "events-utf8-boundary.ndjson", bytes.length),
    );
    const first = await source.page({ limit: 1 }, new AbortController().signal);
    const second = await source.page(
      { limit: 1, cursor: first.nextCursor },
      new AbortController().signal,
    );
    expect(String(first.rows[0].text).endsWith("é")).toBe(true);
    expect(second.rows[0].id).toBe(2);
    expect(second.offset).toBe(1);
  });

  it("reports malformed NDJSON with byte context", async () => {
    const bytes = new Uint8Array(
      await readFile(new URL("events-malformed.ndjson", fixtureRoot)),
    );
    stubFileFetch(bytes);
    const source = await createNDJSONSource(
      definition("ndjson", "events-malformed.ndjson", bytes.length),
    );
    const page = await source.page({ limit: 20 }, new AbortController().signal);
    expect(page.issues).toHaveLength(1);
    expect(page.issues[0].byteOffset).toBeTypeOf("number");
    expect(page.issues[0].line).toBe(9);
  });

  it("preserves quoted multiline CSV records across pages", async () => {
    const bytes = new Uint8Array(
      await readFile(new URL("events.csv", fixtureRoot)),
    );
    stubFileFetch(bytes);
    const source = await createDelimitedSource(
      definition("delimited-text", "events.csv", bytes.length),
    );
    const inspection = await source.inspect(new AbortController().signal);
    const first = await source.page(
      { limit: 30 },
      new AbortController().signal,
    );
    const second = await source.page(
      { limit: 30, cursor: first.nextCursor },
      new AbortController().signal,
    );
    expect(inspection.schema[0].name).toBe("id");
    expect(first.rows[0].note).toContain("second line");
    expect(second.rows[0].id).toBe("31");
    expect(second.offset).toBe(30);
  });

  it("preserves a quoted multiline field across a 256 KiB fetch boundary", async () => {
    const bytes = new Uint8Array(
      await readFile(new URL("events-chunk-boundary.csv", fixtureRoot)),
    );
    stubFileFetch(bytes);
    const source = await createDelimitedSource(
      definition("delimited-text", "events-chunk-boundary.csv", bytes.length),
    );
    const first = await source.page({ limit: 1 }, new AbortController().signal);
    const second = await source.page(
      { limit: 1, cursor: first.nextCursor },
      new AbortController().signal,
    );
    expect(first.rows[0].note).toContain("\ncontinued");
    expect(second.rows[0]).toMatchObject({ id: "2", note: "after boundary" });
  });

  it("detects semicolon CSV and supports an explicit no-header interpretation", async () => {
    const semicolon = new Uint8Array(
      await readFile(new URL("events-semicolon.csv", fixtureRoot)),
    );
    stubFileFetch(semicolon);
    const detected = await createDelimitedSource(
      definition("delimited-text", "events-semicolon.csv", semicolon.length),
    );
    const inspection = await detected.inspect(new AbortController().signal);
    const detectedPage = await detected.page(
      { limit: 10 },
      new AbortController().signal,
    );
    expect(inspection.metadata[0].values).toContainEqual({
      label: "Delimiter",
      value: "Semicolon",
    });
    expect(detectedPage.rows[0].name).toBe("alpha");

    const missing = new Uint8Array(
      await readFile(new URL("events-missing-columns.csv", fixtureRoot)),
    );
    stubFileFetch(missing);
    const noHeader = await createDelimitedSource({
      ...definition(
        "delimited-text",
        "events-missing-columns.csv",
        missing.length,
      ),
      options: { header: false, delimiter: "," },
    });
    const noHeaderPage = await noHeader.page(
      { limit: 10 },
      new AbortController().signal,
    );
    expect(noHeaderPage.rows[0]).toMatchObject({
      column_1: "id",
      column_2: "name",
      column_3: "note",
    });
    expect(noHeaderPage.rows[1].column_3).toBeNull();
    expect(noHeaderPage.rows[2]._extra).toEqual(["extra"]);
  });

  it("reports ambiguous delimiter detection and allows an explicit override", async () => {
    const bytes = new Uint8Array(
      await readFile(new URL("events-ambiguous.csv", fixtureRoot)),
    );
    stubFileFetch(bytes);
    const detected = await createDelimitedSource(
      definition("delimited-text", "events-ambiguous.csv", bytes.length),
    );
    expect((await detected.inspect(new AbortController().signal)).warnings[0])
      .toContain("ambiguous");

    stubFileFetch(bytes);
    const configured = await createDelimitedSource({
      ...definition("delimited-text", "events-ambiguous.csv", bytes.length),
      options: { delimiter: ",", header: true },
    });
    expect((await configured.inspect(new AbortController().signal)).warnings)
      .toEqual([]);
  });

  it("reports unsupported Avro codecs and invalid Snappy checksums precisely", async () => {
    const unsupported = new Uint8Array(
      await readFile(new URL("events-unsupported-codec.avro", fixtureRoot)),
    );
    stubFileFetch(unsupported);
    await expect(
      createAvroSource(
        definition("avro", "events-unsupported-codec.avro", unsupported.length),
        new AbortController().signal,
        () => undefined,
      ),
    )
      .rejects.toMatchObject({ shape: { code: "unsupported-codec" } });

    const corrupt = new Uint8Array(
      await readFile(new URL("events-snappy-bad-checksum.avro", fixtureRoot)),
    );
    stubFileFetch(corrupt);
    const source = await createAvroSource(
      definition("avro", "events-snappy-bad-checksum.avro", corrupt.length),
      new AbortController().signal,
      () => undefined,
    );
    await expect(source.page({ limit: 10 }, new AbortController().signal))
      .rejects.toMatchObject({ shape: { code: "malformed" } });
  });

  it("rejects truncated Avro and Arrow fixtures with format errors", async () => {
    const avro = new Uint8Array(
      await readFile(new URL("events-truncated.avro", fixtureRoot)),
    );
    stubFileFetch(avro);
    await expect(
      createAvroSource(
        definition("avro", "events-truncated.avro", avro.length),
        new AbortController().signal,
        () => undefined,
      ),
    )
      .rejects.toMatchObject({ shape: { code: "malformed" } });

    const arrow = new Uint8Array(
      await readFile(new URL("events-truncated.arrow", fixtureRoot)),
    );
    stubFileFetch(arrow);
    await expect(
      createArrowSource(
        definition("arrow-ipc", "events-truncated.arrow", arrow.length),
        new AbortController().signal,
        () => undefined,
      ),
    )
      .rejects.toMatchObject({ shape: { code: "malformed" } });
  });

  it("enforces buffered format limits before fetching and honors cancellation", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      createAvroSource(
        definition("avro", "huge.avro", 129 * 1024 * 1024),
        new AbortController().signal,
        () => undefined,
      ),
    )
      .rejects.toMatchObject({ shape: { code: "limit" } });
    await expect(
      createArrowSource(
        definition("arrow-ipc", "huge.arrow", 65 * 1024 * 1024),
        new AbortController().signal,
        () => undefined,
      ),
    )
      .rejects.toMatchObject({ shape: { code: "limit" } });
    expect(fetch).not.toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort();
    const ndjson = await createNDJSONSource(
      definition("ndjson", "events.ndjson", 100),
    );
    await expect(ndjson.page({ limit: 10 }, controller.signal)).rejects
      .toMatchObject({ name: "AbortError" });

    const delimited = await createDelimitedSource(
      definition("delimited-text", "events.csv", 100),
    );
    await expect(delimited.page({ limit: 10 }, controller.signal)).rejects
      .toMatchObject({ name: "AbortError" });
    await expect(
      createAvroSource(
        definition("avro", "events.avro", 100),
        controller.signal,
        () => undefined,
      ),
    )
      .rejects.toMatchObject({ name: "AbortError" });
    await expect(
      createArrowSource(
        definition("arrow-ipc", "events.arrow", 100),
        controller.signal,
        () => undefined,
      ),
    )
      .rejects.toMatchObject({ name: "AbortError" });
  });

  it("stops a buffered response with no Content-Length at the byte ceiling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(6));
              controller.enqueue(new Uint8Array(6));
              controller.close();
            },
          }),
        )
      ),
    );
    await expect(
      fetchBoundedFile(
        "https://example.test/content",
        undefined,
        8,
        new AbortController().signal,
      ),
    )
      .rejects.toMatchObject({ shape: { code: "limit" } });
  });
});

function definition(
  format: "avro" | "arrow-ipc" | "ndjson" | "delimited-text",
  name: string,
  size: number,
) {
  return {
    sourceId: name,
    format,
    name,
    contentUrl: "https://example.test/content",
    size,
		limits: defaultStructuredDataLimits,
  } as const;
}

function stubFileFetch(bytes: Uint8Array): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const range = new Headers(init?.headers).get("Range");
      if (!range) {
        return new Response(bytes.slice().buffer as ArrayBuffer, {
          status: 200,
          headers: { "Content-Length": String(bytes.length) },
        });
      }
      const match = range.match(/^bytes=(\d+)-(\d+)$/);
      if (!match) return new Response(null, { status: 416 });
      const start = Number(match[1]);
      if (start >= bytes.length) return new Response(null, { status: 416 });
      const end = Math.min(Number(match[2]), bytes.length - 1);
      return new Response(bytes.slice(start, end + 1).buffer as ArrayBuffer, {
        status: 206,
        headers: {
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        },
      });
    }),
  );
}
