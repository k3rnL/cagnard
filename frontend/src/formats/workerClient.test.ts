import { describe, expect, it } from "vitest";

import type { StructuredInspection } from "./models";
import { StructuredDataClientError, StructuredDataWorkerClient } from "./workerClient";
import type { StructuredWorkerRequest, StructuredWorkerResponse } from "./workerProtocol";
import { maxStructuredWorkerResponseBytes, structuredWorkerResponseBytes, structuredWorkerResponseFits } from "./workerProtocol";

describe("structured-data worker client", () => {
  it("correlates out-of-order responses by request ID", async () => {
    const worker = new FakeWorker();
    const client = new StructuredDataWorkerClient(worker as unknown as Worker);
    const first = client.inspect("first");
    const second = client.inspect("second");
    const requests = worker.requestsOfType("inspect");

    worker.emit({ id: requests[1].id, type: "inspection", inspection: inspection("second") });
    worker.emit({ id: requests[0].id, type: "inspection", inspection: inspection("first") });

    await expect(first).resolves.toMatchObject({ variant: "first" });
    await expect(second).resolves.toMatchObject({ variant: "second" });
    client.terminate();
  });

  it("cancels an operation, rejects it once, and ignores its stale response", async () => {
    const worker = new FakeWorker();
    const client = new StructuredDataWorkerClient(worker as unknown as Worker);
    const controller = new AbortController();
    const pending = client.inspect("source", controller.signal);
    const request = worker.requestsOfType("inspect")[0];

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.requestsOfType("cancel")[0]).toMatchObject({ targetId: request.id });
    worker.emit({ id: request.id, type: "inspection", inspection: inspection("late") });

    const next = client.inspect("source");
    const nextRequest = worker.requestsOfType("inspect").at(-1) as Extract<StructuredWorkerRequest, { type: "inspect" }>;
    worker.emit({ id: nextRequest.id, type: "inspection", inspection: inspection("current") });
    await expect(next).resolves.toMatchObject({ variant: "current" });
    client.terminate();
  });

  it("keeps another source request alive when one source is canceled", async () => {
    const worker = new FakeWorker();
    const client = new StructuredDataWorkerClient(worker as unknown as Worker);
    const controller = new AbortController();
    const canceled = client.inspect("canceled-source", controller.signal);
    const active = client.inspect("active-source");
    const [canceledRequest, activeRequest] = worker.requestsOfType("inspect");

    controller.abort();
    await expect(canceled).rejects.toMatchObject({ name: "AbortError" });
    worker.emit({
      id: activeRequest.id,
      type: "inspection",
      inspection: inspection("still active"),
    });

    await expect(active).resolves.toMatchObject({ variant: "still active" });
    expect(worker.requestsOfType("cancel")).toEqual([
      expect.objectContaining({ targetId: canceledRequest.id }),
    ]);
    client.terminate();
  });

  it("normalizes worker errors and removes abort listeners", async () => {
    const worker = new FakeWorker();
    const client = new StructuredDataWorkerClient(worker as unknown as Worker);
    const pending = client.inspect("source");
    const request = worker.requestsOfType("inspect")[0];
    worker.emit({
      id: request.id,
      type: "error",
      error: { code: "malformed", message: "Broken container", detail: "offset 12", retryable: false }
    });

    await expect(pending).rejects.toEqual(expect.objectContaining<Partial<StructuredDataClientError>>({
      name: "StructuredDataClientError",
      message: "Broken container"
    }));
    client.terminate();
  });

  it("closes one source idempotently without terminating the shared worker", async () => {
    const worker = new FakeWorker();
    const client = new StructuredDataWorkerClient(worker as unknown as Worker);
    const closing = client.closeSource("source");
    const duplicate = client.closeSource("source");
    const request = worker.requestsOfType("close")[0];
    worker.emit({ id: request.id, type: "closed" });

    await Promise.all([closing, duplicate]);
    await client.closeSource("source");
    expect(worker.requestsOfType("close")).toHaveLength(1);
    expect(worker.terminated).toBe(false);

    const inspecting = client.inspect("other");
    const inspectRequest = worker.requestsOfType("inspect")[0];
    worker.emit({ id: inspectRequest.id, type: "inspection", inspection: inspection("other") });
    await expect(inspecting).resolves.toMatchObject({ variant: "other" });
    client.terminate();
  });

  it("shuts down all runtime state before terminating the worker", async () => {
    const worker = new FakeWorker();
    const client = new StructuredDataWorkerClient(worker as unknown as Worker);
    const shutdown = client.shutdown();
    const duplicate = client.shutdown();
    const request = worker.requestsOfType("shutdown")[0];
    worker.emit({ id: request.id, type: "shutdown" });

    await Promise.all([shutdown, duplicate]);
    expect(worker.requestsOfType("shutdown")).toHaveLength(1);
    expect(worker.terminated).toBe(true);
    await expect(client.inspect("source")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects pending work and cleans up when the worker crashes", async () => {
    const worker = new FakeWorker();
    let fatal = false;
    const client = new StructuredDataWorkerClient(
      worker as unknown as Worker,
      () => {
        fatal = true;
      },
    );
    const pending = client.inspect("source");
    worker.fail("decoder crashed");

    await expect(pending).rejects.toMatchObject({
      name: "StructuredDataClientError",
      shape: { code: "internal", retryable: true }
    });
    expect(worker.terminated).toBe(true);
    expect(fatal).toBe(true);
  });

  it("measures worker payloads against the shared 16 MB boundary", () => {
    const response: StructuredWorkerResponse = {
      id: "payload",
      type: "error",
      error: { code: "internal", message: "x".repeat(1024), retryable: false }
    };
    expect(structuredWorkerResponseBytes(response)).toBeGreaterThan(1024);
    expect(structuredWorkerResponseBytes(response)).toBeLessThan(maxStructuredWorkerResponseBytes);
    expect(structuredWorkerResponseFits(response)).toBe(true);

    const oversized: StructuredWorkerResponse = {
      id: "oversized",
      type: "error",
      error: { code: "internal", message: "x".repeat(maxStructuredWorkerResponseBytes), retryable: false }
    };
    expect(structuredWorkerResponseFits(oversized)).toBe(false);
  });
});

class FakeWorker {
  onmessage: ((event: MessageEvent<StructuredWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly messages: StructuredWorkerRequest[] = [];
  terminated = false;

  postMessage(message: StructuredWorkerRequest): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(response: StructuredWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<StructuredWorkerResponse>);
  }

  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }

  requestsOfType<T extends StructuredWorkerRequest["type"]>(type: T): Array<Extract<StructuredWorkerRequest, { type: T }>> {
    return this.messages.filter((message): message is Extract<StructuredWorkerRequest, { type: T }> => message.type === type);
  }
}

function inspection(variant: string): StructuredInspection {
  return {
    format: "ndjson",
    formatLabel: "JSON Lines",
    variant,
    schema: [],
    capabilities: {
      exactCount: false,
      exactFilter: false,
      exactProjection: false,
      exactSort: false,
      pagination: "cursor",
      exportCurrentPage: true
    },
    metadata: [],
    warnings: []
  };
}
