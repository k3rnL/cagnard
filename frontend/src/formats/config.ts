import { cagnardApi } from "../api/client";
import type { StructuredDataLimits } from "./models";

export const defaultStructuredDataLimits: StructuredDataLimits = {
  relational: { maxIngestionBytes: 64 * 1024 * 1024, maxIngestionRows: 200_000 },
  sql: {
    timeoutMilliseconds: 30_000,
    maxResultRows: 100_000,
    maxQueryCharacters: 100_000,
  },
  worker: { maxResponseBytes: 16 * 1024 * 1024 },
  iceberg: { maxMetadataBytes: 2 * 1024 * 1024, maxProbeEntries: 10_000 },
  netcdf: {
    maxSourceBytes: 128 * 1024 * 1024,
    maxSliceCells: 100_000,
    maxSliceBytes: 16 * 1024 * 1024,
    maxProjectionRows: 100_000,
    maxPlotCells: 20_000,
  },
  exports: { maxRows: 100_000, maxBytes: 16 * 1024 * 1024 },
};

let configuredLimits: Promise<StructuredDataLimits> | undefined;

export function loadStructuredDataLimits(): Promise<StructuredDataLimits> {
  configuredLimits ??= cagnardApi.structuredDataConfig()
    .then((limits) => limits)
    .catch(() => defaultStructuredDataLimits);
  return configuredLimits;
}
