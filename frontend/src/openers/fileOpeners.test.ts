import { describe, expect, it } from "vitest";

import type { StorageEntry } from "../api/types";
import { firstPartyOpeners, loadFirstPartyOpenerRuntime, openerBlockedReason, resolveFileOpener } from "./fileOpeners";

describe("first-party opener registry", () => {
  it.each([
    ["events.parquet", "application/octet-stream", "parquet"],
    ["events.avro", "application/octet-stream", "avro"],
    ["events.feather", "binary/octet-stream", "arrow-ipc"],
    ["events.jsonl", "application/json", "ndjson"],
    ["events.csv", "text/plain", "delimited-text"],
    ["document.json", "application/json", "json"]
  ])("routes %s deterministically", (name, mimeType, expected) => {
    expect(resolveFileOpener(entry(name, mimeType))?.opener.id).toBe(expected);
  });

  it("declares a lazy runtime for structured data and inline runtimes for existing views", () => {
    expect(firstPartyOpeners.find((opener) => opener.id === "parquet")?.runtime.kind).toBe("lazy");
    expect(firstPartyOpeners.find((opener) => opener.id === "markdown")?.runtime.kind).toBe("inline");
  });

  it("loads specialized opener code only through a declared lazy runtime", async () => {
    await expect(loadFirstPartyOpenerRuntime("parquet")).resolves.toMatchObject({ default: expect.any(Function) });
    await expect(loadFirstPartyOpenerRuntime("markdown")).rejects.toThrow("has no lazy runtime");
    await expect(loadFirstPartyOpenerRuntime("missing")).rejects.toThrow("Unknown first-party opener");
  });

  it("uses deterministic priority when category and fallback text openers both match", () => {
    expect(resolveFileOpener(entry("service.log", "text/plain"))?.opener.id).toBe("log");
  });

  it("rejects an opener when its storage capability is unavailable", () => {
    const candidate = entry("events.parquet", "application/vnd.apache.parquet");
    candidate.capabilities = candidate.capabilities.filter((capability) => capability.name !== "download");
    expect(resolveFileOpener(candidate)).toBeUndefined();
    expect(openerBlockedReason(candidate)).toContain("download");
  });

  it("falls back cleanly for unsupported binary files", () => {
    const match = resolveFileOpener(entry("payload.unknown", "application/octet-stream"));
    expect(match).toBeUndefined();
  });

  it("rejects download-based viewers above their declared size ceiling", () => {
    const candidate = entry("large.pdf", "application/pdf");
    candidate.metadata.size = 49 * 1024 * 1024;
    expect(resolveFileOpener(candidate)).toBeUndefined();
    expect(openerBlockedReason(candidate)).toContain("48 MB");
  });
});

function entry(name: string, mimeType: string): StorageEntry {
  return {
    id: name,
    name,
    path: name,
    kind: "file",
    metadata: { size: 1024, mimeType, unavailable: [] },
    capabilities: [
      { name: "open", status: "supported" },
      { name: "download", status: "supported" },
      { name: "preview", status: "supported" },
      { name: "bounded-read", status: "supported" },
      { name: "range-read", status: "supported" },
      { name: "overwrite", status: "supported" }
    ],
    providerSpecific: {}
  };
}
