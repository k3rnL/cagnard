import { describe, expect, it } from "vitest";

import { classifyFile, extensionOf } from "./fileTypeCatalog";

describe("file type catalog", () => {
  it.each([
    ["events.parquet", "application/octet-stream", "analytical-data", "application/vnd.apache.parquet"],
    ["events.avro", "application/x-avro", "analytical-data", "application/avro"],
    ["events.arrow", "binary/octet-stream", "analytical-data", "application/vnd.apache.arrow.file"],
    ["events.ipc", undefined, "analytical-data", "application/vnd.apache.arrow.stream"],
    ["events.ndjson", "text/plain", "ndjson", "application/x-ndjson"],
    ["events.tsv", "text/plain", "csv", "text/tab-separated-values"]
  ])("classifies %s", (name, providerMime, category, mimeType) => {
    const classification = classifyFile(name, providerMime);
    expect(classification.category).toBe(category);
    expect(classification.mimeType).toBe(mimeType);
  });

  it("prefers the longest compound extension", () => {
    expect(extensionOf("archive.TAR.GZ")).toBe(".tar.gz");
  });

  it("keeps ordinary JSON separate from line-delimited JSON", () => {
    expect(classifyFile("document.json").category).toBe("json");
    expect(classifyFile("events.jsonl").category).toBe("ndjson");
  });
});
