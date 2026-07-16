export function debuglog(): (...values: unknown[]) => void {
  return () => undefined;
}

export function deprecate<T extends (...arguments_: never[]) => unknown>(callback: T): T {
  return callback;
}

export function format(template: unknown, ...values: unknown[]): string {
  if (typeof template !== "string") return [template, ...values].map(String).join(" ");
  let index = 0;
  const formatted = template.replace(/%[sdj%]/g, (token) => {
    if (token === "%%") return "%";
    const value = values[index++];
    if (token === "%j") {
      try {
        return JSON.stringify(value);
      } catch {
        return "[Circular]";
      }
    }
    return token === "%d" ? String(Number(value)) : String(value);
  });
  return [formatted, ...values.slice(index).map(String)].join(" ");
}

export function inherits(
  constructor: { prototype: object },
  superConstructor: { prototype: object }
): void {
  Object.setPrototypeOf(constructor.prototype, superConstructor.prototype);
}
