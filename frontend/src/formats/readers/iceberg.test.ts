import { describe, expect, it } from "vitest";

import { icebergFacadeDirectory, icebergFacadeSource } from "./iceberg";

describe("Iceberg source facade", () => {
  it("confines DuckDB to the selected same-origin table facade", () => {
    expect(icebergFacadeDirectory(
      "https://cagnard.example/api/storage/iceberg/content/global/shared/dGFibGU/metadata/v2.metadata.json",
    )).toBe(
      "https://cagnard.example/api/storage/iceberg/content/global/shared/dGFibGU",
    );
  });

  it("rejects a source that bypasses the authorized metadata facade", () => {
    expect(() => icebergFacadeDirectory(
      "https://foreign.example/table/v2.metadata.json",
    )).toThrow("authorized table facade");
  });

  it("drops query and fragment data from the allowlisted directory", () => {
    expect(icebergFacadeDirectory(
      "https://cagnard.example/api/storage/iceberg/content/global/shared/dGFibGU/metadata/v2.metadata.json?secret=no#fragment",
    )).toBe(
      "https://cagnard.example/api/storage/iceberg/content/global/shared/dGFibGU",
    );
  });

  it("binds DuckDB to the probed metadata version without unsafe guessing", () => {
    expect(icebergFacadeSource(
      "https://cagnard.example/api/storage/iceberg/content/global/shared/dGFibGU/metadata/v17.metadata.json",
    )).toEqual({
      directory: "https://cagnard.example/api/storage/iceberg/content/global/shared/dGFibGU",
      metadataVersion: "17",
    });
  });
});
