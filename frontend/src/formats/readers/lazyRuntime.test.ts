import { describe, expect, it, vi } from "vitest";

import { LazyRuntime } from "./lazyRuntime";
import { parquetRegistrationName } from "./parquet";

describe("lazy shared runtime", () => {
  it("deduplicates concurrent and sequential initialization", async () => {
    const value = { id: 1 };
    const create = vi.fn(async (_request: string) => value);
    const dispose = vi.fn(async () => undefined);
    const runtime = new LazyRuntime(create, dispose);

    const [first, second] = await Promise.all([
      runtime.get("first"),
      runtime.get("second"),
    ]);
    expect(first).toBe(value);
    expect(second).toBe(value);
    expect(await runtime.get("third")).toBe(value);
    expect(create).toHaveBeenCalledTimes(1);

    await runtime.shutdown();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("drops rejected initialization so a later request can retry", async () => {
    const value = { id: 2 };
    const create = vi.fn()
      .mockRejectedValueOnce(new Error("worker failed"))
      .mockResolvedValueOnce(value);
    const runtime = new LazyRuntime(create, async () => undefined);

    await expect(runtime.get()).rejects.toThrow("worker failed");
    await expect(runtime.get()).resolves.toBe(value);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("invalidates only the expected fatal runtime", async () => {
    const value = { id: 3 };
    const dispose = vi.fn(async () => undefined);
    const runtime = new LazyRuntime(async () => value, dispose);

    await runtime.get();
    await runtime.invalidate({ id: 3 });
    expect(dispose).not.toHaveBeenCalled();
    await runtime.invalidate(value);
    expect(dispose).toHaveBeenCalledWith(value);
  });

  it("disposes one fatal runtime exactly once under concurrent invalidation", async () => {
    const value = { id: 4 };
    const dispose = vi.fn(async () => undefined);
    const runtime = new LazyRuntime(async () => value, dispose);

    await runtime.get();
    await Promise.all([
      runtime.invalidate(value),
      runtime.invalidate(value),
      runtime.shutdown(),
    ]);

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe("Parquet source registration", () => {
  it("creates unique SQL-safe virtual filenames per source", () => {
    const first = parquetRegistrationName("source/one:'unsafe");
    const second = parquetRegistrationName("source-two");
    expect(first).toMatch(/^cagnard-[a-zA-Z0-9_-]+\.parquet$/);
    expect(second).toMatch(/^cagnard-[a-zA-Z0-9_-]+\.parquet$/);
    expect(first).not.toBe(second);
  });
});
