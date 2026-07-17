export class LazyRuntime<T, Args extends unknown[]> {
  private current?: Promise<T>;

  constructor(
    private readonly create: (...args: Args) => Promise<T>,
    private readonly dispose: (value: T) => Promise<void>,
  ) {}

  get(...args: Args): Promise<T> {
    if (this.current) return this.current;
    const pending = this.create(...args);
    this.current = pending;
    void pending.catch(() => {
      if (this.current === pending) this.current = undefined;
    });
    return pending;
  }

  async invalidate(expected?: T): Promise<void> {
    const pending = this.current;
    if (!pending) return;
    let value: T;
    try {
      value = await pending;
    } catch {
      if (this.current === pending) this.current = undefined;
      return;
    }
    if (expected !== undefined && value !== expected) return;
    if (this.current !== pending) return;
    this.current = undefined;
    await this.dispose(value);
  }

  shutdown(): Promise<void> {
    return this.invalidate();
  }
}
