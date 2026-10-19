import { describe, expect, it } from "vitest";
import { allows } from "./permissions";
import type { StorageAction } from "./types";

describe("effective storage actions", () => {
  const actions: StorageAction[] = ["storage.list", "storage.read", "storage.write", "storage.mkdir", "storage.rename", "storage.delete"];

  it("denies absent roots and undeclared actions", () => {
    expect(allows(undefined, "storage.read")).toBe(false);
    expect(allows({ actions: ["storage.list"], readOnly: false }, "storage.read")).toBe(false);
    expect(allows({ actions: [], readOnly: false }, "storage.write")).toBe(false);
  });

  it("keeps account read-only as a ceiling on every mutating action", () => {
    for (const action of actions) {
      expect(allows({ actions, readOnly: true }, action)).toBe(action === "storage.list" || action === "storage.read");
      expect(allows({ actions, readOnly: false }, action)).toBe(true);
    }
  });
});
