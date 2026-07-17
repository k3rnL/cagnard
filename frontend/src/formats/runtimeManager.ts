import { StructuredDataWorkerClient } from "./workerClient";

export interface StructuredRuntimeClient {
  closeSource(sourceId: string): Promise<void>;
  shutdown(): Promise<void>;
  terminate(): void;
}

export interface StructuredRuntimeLease<T extends StructuredRuntimeClient = StructuredDataWorkerClient> {
  client: T;
  sourceId: string;
  release(): Promise<void>;
}

type RuntimeClientFactory<T extends StructuredRuntimeClient> = (
  onFatal: () => void,
) => T;

export class StructuredDataRuntimeManager<
  T extends StructuredRuntimeClient = StructuredDataWorkerClient,
> {
  private clientPromise?: Promise<T>;

  constructor(private readonly createClient: RuntimeClientFactory<T>) {}

  async acquire(): Promise<StructuredRuntimeLease<T>> {
    const client = await this.getClient();
    const sourceId = nextSourceId();
    let released = false;
    return {
      client,
      sourceId,
      release: async () => {
        if (released) return;
        released = true;
        await client.closeSource(sourceId);
      },
    };
  }

  async shutdown(): Promise<void> {
    const pending = this.clientPromise;
    this.clientPromise = undefined;
    if (!pending) return;
    try {
      const client = await pending;
      await client.shutdown();
    } catch {
      // A failed runtime is already unusable and can be replaced on demand.
    }
  }

  terminate(): void {
    const pending = this.clientPromise;
    this.clientPromise = undefined;
    void pending?.then((client) => client.terminate()).catch(() => undefined);
  }

  private getClient(): Promise<T> {
    if (this.clientPromise) return this.clientPromise;
    let client: T;
    const pending = Promise.resolve().then(() => {
      client = this.createClient(() => this.invalidate(client));
      return client;
    });
    this.clientPromise = pending;
    void pending.catch(() => {
      if (this.clientPromise === pending) this.clientPromise = undefined;
    });
    return pending;
  }

  private invalidate(client: T): void {
    const pending = this.clientPromise;
    if (!pending) return;
    void pending.then((current) => {
      if (current === client && this.clientPromise === pending) {
        this.clientPromise = undefined;
      }
    }).catch(() => undefined);
  }
}

const sharedRuntime = new StructuredDataRuntimeManager(
  (onFatal) => new StructuredDataWorkerClient(undefined, onFatal),
);

export function acquireStructuredDataRuntime(): Promise<StructuredRuntimeLease> {
  return sharedRuntime.acquire();
}

export function shutdownStructuredDataRuntime(): Promise<void> {
  return sharedRuntime.shutdown();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => sharedRuntime.terminate());
}

function nextSourceId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `source-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
