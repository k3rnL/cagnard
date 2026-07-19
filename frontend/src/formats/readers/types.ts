import type {
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
} from "../models";

export interface StructuredDataSource {
  inspect(signal: AbortSignal): Promise<StructuredInspection>;
  page(request: StructuredPageRequest, signal: AbortSignal): Promise<StructuredPage>;
  relationScope?(): StructuredRelationScope;
  sql?(request: StructuredSQLRequest, signal: AbortSignal): Promise<StructuredSQLResult>;
  icebergSnapshots?(signal: AbortSignal): Promise<IcebergSnapshot[]>;
  selectIcebergSnapshot?(snapshotId: string | undefined, signal: AbortSignal): Promise<StructuredInspection>;
  netcdfSlice?(request: NetCDFSliceRequest, signal: AbortSignal): Promise<NetCDFSliceResult>;
  close(): Promise<void>;
}

export type StructuredSourceFactory = (
  definition: StructuredSourceDefinition,
  signal: AbortSignal,
  progress: (phase: string, loaded?: number, total?: number) => void
) => Promise<StructuredDataSource>;
