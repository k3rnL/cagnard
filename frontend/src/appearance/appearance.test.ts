import { describe, expect, it } from "vitest";

import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_CONFIG,
  normalizeAppearanceConfig,
  observeSystemAppearance,
  readAppearancePreference,
  resolveAppearance,
  writeAppearancePreference
} from "./appearance";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("appearance resolution", () => {
  it("uses a valid browser preference when overrides are enabled", () => {
    expect(resolveAppearance(DEFAULT_APPEARANCE_CONFIG, { palette: "solar", mode: "dark" }, false)).toEqual({
      palette: "solar",
      mode: "dark",
      resolvedMode: "dark"
    });
  });

  it("uses configured defaults when overrides are locked", () => {
    const config = { defaultPalette: "solar", defaultMode: "light", allowUserOverride: false } as const;
    expect(resolveAppearance(config, { palette: "classic", mode: "dark" }, true)).toEqual({
      palette: "solar",
      mode: "light",
      resolvedMode: "light"
    });
  });

  it("follows the current system preference", () => {
    expect(resolveAppearance(DEFAULT_APPEARANCE_CONFIG, undefined, false).resolvedMode).toBe("light");
    expect(resolveAppearance(DEFAULT_APPEARANCE_CONFIG, undefined, true).resolvedMode).toBe("dark");
  });

  it("observes live system preference changes and unsubscribes", () => {
    let listener: ((event: { matches: boolean }) => void) | undefined;
    const media = {
      addEventListener: (_type: string, next: (event: { matches: boolean }) => void) => { listener = next; },
      removeEventListener: (_type: string, current: (event: { matches: boolean }) => void) => {
        if (listener === current) listener = undefined;
      }
    } as unknown as Pick<MediaQueryList, "addEventListener" | "removeEventListener">;
    const changes: boolean[] = [];

    const unsubscribe = observeSystemAppearance(media, (dark) => changes.push(dark));
    listener?.({ matches: true });
    listener?.({ matches: false });
    unsubscribe();

    expect(changes).toEqual([true, false]);
    expect(listener).toBeUndefined();
  });
});

describe("appearance persistence", () => {
  it("round-trips a valid versioned preference", () => {
    const storage = new MemoryStorage();
    writeAppearancePreference(storage, { palette: "solar", mode: "system" });
    expect(readAppearancePreference(storage)).toEqual({ palette: "solar", mode: "system" });
  });

  it("removes malformed or unsupported local state", () => {
    const storage = new MemoryStorage();
    storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ palette: "purple", mode: "night" }));
    expect(readAppearancePreference(storage)).toBeUndefined();
    expect(storage.getItem(APPEARANCE_STORAGE_KEY)).toBeNull();
  });

  it("normalizes an unsafe discovery response", () => {
    expect(normalizeAppearanceConfig({ defaultPalette: "purple", defaultMode: 3 })).toEqual(DEFAULT_APPEARANCE_CONFIG);
  });
});
