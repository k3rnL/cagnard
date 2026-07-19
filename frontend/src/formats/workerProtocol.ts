import type {
  StructuredErrorShape,
  StructuredInspection,
  StructuredPage,
  StructuredPageRequest,
  StructuredRelationScope,
  StructuredSQLRequest,
  StructuredSQLResult,
  IcebergSnapshot,
  NetCDFSliceRequest,
  NetCDFSliceResult,
  StructuredSourceDefinition
} from "./models";

export type StructuredWorkerRequest =
  | { id: string; type: "initialize"; source: StructuredSourceDefinition }
  | { id: string; type: "inspect"; sourceId: string }
  | { id: string; type: "page" | "query"; sourceId: string; request: StructuredPageRequest }
  | { id: string; type: "relation-scope"; sourceId: string }
  | { id: string; type: "sql"; sourceId: string; request: StructuredSQLRequest }
  | { id: string; type: "iceberg-snapshots"; sourceId: string }
  | { id: string; type: "iceberg-select-snapshot"; sourceId: string; snapshotId?: string }
  | { id: string; type: "netcdf-slice"; sourceId: string; request: NetCDFSliceRequest }
  | { id: string; type: "cancel"; targetId: string }
  | { id: string; type: "close"; sourceId: string }
  | { id: string; type: "shutdown" };

export type StructuredWorkerResponse =
  | { id: string; type: "initialized" | "inspection"; inspection: StructuredInspection }
  | { id: string; type: "page"; page: StructuredPage }
  | { id: string; type: "relation-scope"; scope: StructuredRelationScope }
  | { id: string; type: "sql"; result: StructuredSQLResult }
  | { id: string; type: "iceberg-snapshots"; snapshots: IcebergSnapshot[] }
  | { id: string; type: "netcdf-slice"; result: NetCDFSliceResult }
  | { id: string; type: "closed" | "canceled" | "shutdown" }
  | { id: string; type: "progress"; phase: string; loaded?: number; total?: number }
  | { id: string; type: "error"; error: StructuredErrorShape };

export function isTerminalWorkerResponse(response: StructuredWorkerResponse): boolean {
  return response.type !== "progress";
}

export const maxStructuredWorkerResponseBytes = 16 * 1024 * 1024;

export function structuredWorkerResponseBytes(response: StructuredWorkerResponse): number {
  return new TextEncoder().encode(JSON.stringify(response)).byteLength;
}

export function structuredWorkerResponseFits(
  response: StructuredWorkerResponse,
  maximumBytes = maxStructuredWorkerResponseBytes,
): boolean {
  return structuredWorkerResponseBytes(response) <= maximumBytes;
}
