import { describe, expect, it, vi } from "vitest";

import {
  StructuredDataRuntimeManager,
  type StructuredRuntimeClient,
} from "./runtimeManager";

describe("structured runtime manager", () => {
  it("reuses one client and grants isolated idempotent source leases", async () => {
    const client = new FakeRuntimeClient();
    const factory = vi.fn(() => client);
    const manager = new StructuredDataRuntimeManager(factory);

    const [first, second] = await Promise.all([
      manager.acquire(),
      manager.acquire(),
    ]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(first.client).toBe(client);
    expect(second.client).toBe(client);
    expect(first.sourceId).not.toBe(second.sourceId);

    await first.release();
    await first.release();
    await second.release();
    expect(client.closed).toEqual([first.sourceId, second.sourceId]);
    expect(client.terminated).toBe(false);
  });

  it("terminates the shared client only on runtime shutdown", async () => {
    const first = new FakeRuntimeClient();
    const second = new FakeRuntimeClient();
    const factory = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const manager = new StructuredDataRuntimeManager(factory);

    await manager.acquire();
    await Promise.all([manager.shutdown(), manager.shutdown()]);
    expect(first.shutdowns).toBe(1);

    const next = await manager.acquire();
    expect(next.client).toBe(second);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("discards a fatally failed client so retry creates a fresh runtime", async () => {
    const clients = [new FakeRuntimeClient(), new FakeRuntimeClient()];
    let fatal: (() => void) | undefined;
    const manager = new StructuredDataRuntimeManager((onFatal) => {
      fatal = onFatal;
      return clients.shift() as FakeRuntimeClient;
    });

    const first = await manager.acquire();
    fatal?.();
    await Promise.resolve();
    const second = await manager.acquire();
    expect(second.client).not.toBe(first.client);
  });
});

class FakeRuntimeClient implements StructuredRuntimeClient {
  readonly closed: string[] = [];
  shutdowns = 0;
  terminated = false;

  async closeSource(sourceId: string): Promise<void> {
    this.closed.push(sourceId);
  }

  async shutdown(): Promise<void> {
    this.shutdowns += 1;
    this.terminated = true;
  }

  terminate(): void {
    this.terminated = true;
  }
}
