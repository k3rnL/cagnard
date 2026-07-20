export type StructuredFormatId =
  | "parquet"
  | "avro"
  | "arrow-ipc"
  | "ndjson"
  | "delimited-text"
  | "iceberg"
  | "netcdf";

export type StructuredPrimitive = null | boolean | number | string;
export type StructuredValue =
  | StructuredPrimitive
  | StructuredValue[]
  | { [key: string]: StructuredValue }
  | { kind: "binary"; byteLength: number; preview: string; truncated: boolean };

export interface StructuredField {
  name: string;
  physicalType: string;
  logicalType?: string;
  nullable: boolean;
  children?: StructuredField[];
  metadata?: Record<string, string>;
}

export interface StructuredCapabilities {
  exactCount: boolean;
  exactFilter: boolean;
  exactProjection: boolean;
  exactSort: boolean;
  pagination: "offset" | "cursor";
  exportCurrentPage: boolean;
  sql: boolean;
}

export interface StructuredRelationScope {
  relation: "data";
  label: string;
  description: string;
  exact: boolean;
  bounded: boolean;
  rowCount?: number;
  maximumRows?: number;
  maximumBytes?: number;
  generation: number;
}

export interface StructuredMetadataSection {
  title: string;
  values: Array<{ label: string; value: StructuredValue }>;
}

export interface StructuredInspection {
  format: StructuredFormatId;
  formatLabel: string;
  variant?: string;
  schema: StructuredField[];
  capabilities: StructuredCapabilities;
  totalRows?: number;
  metadata: StructuredMetadataSection[];
  warnings: string[];
  relation?: StructuredRelationScope;
  netcdf?: NetCDFDataset;
}

export interface StructuredPageIssue {
  message: string;
  line?: number;
  byteOffset?: number;
}

export interface StructuredPage {
  columns: string[];
  rows: Array<Record<string, StructuredValue>>;
  offset: number;
  nextCursor?: string;
  totalRows?: number;
  partial: boolean;
  issues: StructuredPageIssue[];
}

export type StructuredFilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is-null";

export interface StructuredFilter {
  column: string;
  operator: StructuredFilterOperator;
  value?: StructuredPrimitive;
}

export interface StructuredSort {
  column: string;
  direction: "asc" | "desc";
}

export interface StructuredPageRequest {
  cursor?: string;
  limit: number;
  projection?: string[];
  filters?: StructuredFilter[];
  sorts?: StructuredSort[];
}

export interface StructuredSQLRequest {
  sql: string;
  cursor?: string;
  limit: number;
  generation: number;
}

export interface StructuredSQLResult {
  page: StructuredPage;
  elapsedMilliseconds: number;
  generation: number;
}

export interface IcebergSnapshot {
  sequenceNumber?: string;
  snapshotId: string;
  parentSnapshotId?: string;
  committedAt?: string;
  operation?: string;
  manifestList?: string;
  summary: Record<string, string>;
  current: boolean;
}

export interface NetCDFDimension {
  name: string;
  path: string;
  groupPath: string;
  size: number;
  unlimited: boolean;
  coordinateVariablePath?: string;
  units?: string;
}

export type NetCDFVariableRole =
  | "coordinate"
  | "latitude"
  | "longitude"
  | "time"
  | "vertical"
  | "data";

export interface NetCDFVariable {
  name: string;
  path: string;
  groupPath: string;
  physicalType: string;
  dimensions: string[];
  dimensionPaths: string[];
  shape: number[];
  size: number;
  byteSize?: number;
  chunked: boolean;
  chunks?: number[];
  compression?: string;
  attributes: Record<string, StructuredValue>;
  units?: string;
  standardName?: string;
  longName?: string;
  calendar?: string;
  role: NetCDFVariableRole;
}

export interface NetCDFGroup {
  name: string;
  path: string;
  parentPath?: string;
  dimensions: string[];
  variables: string[];
  attributes: Record<string, StructuredValue>;
}

export interface NetCDFDataset {
  variant: string;
  groups: NetCDFGroup[];
  dimensions: NetCDFDimension[];
  variables: NetCDFVariable[];
  sourceBytes: number;
  sourceByteLimit: number;
  sliceCellLimit: number;
  sliceByteLimit: number;
  projectionRowLimit: number;
  plotCellLimit: number;
  accessMode: "bounded-buffer" | "range";
}

export interface NetCDFDimensionSelection {
  dimensionPath: string;
  start: number;
  count: number;
}

export interface NetCDFSliceRequest {
  variablePaths: string[];
  selections: NetCDFDimensionSelection[];
  xDimensionPath?: string;
  yDimensionPath?: string;
  decoded: boolean;
}

export interface NetCDFSlicePlot {
  kind: "scalar" | "line" | "heatmap" | "table";
  width: number;
  height: number;
  values: StructuredPrimitive[];
  xValues?: StructuredPrimitive[];
  yValues?: StructuredPrimitive[];
  xLabel?: string;
  yLabel?: string;
  valueLabel: string;
  units?: string;
}

export interface NetCDFSliceProjection {
  variablePaths: string[];
  dimensionPaths: string[];
  selections: NetCDFDimensionSelection[];
  xDimensionPath?: string;
  yDimensionPath?: string;
  decoded: boolean;
  rowCount: number;
  plot: NetCDFSlicePlot;
}

export interface NetCDFSliceResult {
  inspection: StructuredInspection;
  page: StructuredPage;
  projection: NetCDFSliceProjection;
}

export type StructuredErrorCode =
  | "aborted"
  | "authorization"
  | "internal"
  | "limit"
  | "malformed"
  | "network"
  | "query"
  | "range-unavailable"
  | "unsupported-codec"
  | "unsupported-format";

export interface StructuredErrorShape {
  code: StructuredErrorCode;
  message: string;
  detail?: string;
  retryable: boolean;
}

export interface StructuredSourceDefinition {
  sourceId: string;
  format: StructuredFormatId;
  name: string;
  contentUrl: string;
  size?: number;
  mimeType?: string;
	limits: StructuredDataLimits;
  options?: {
    delimiter?: "," | "\t" | ";" | "|";
    header?: boolean;
  };
}

export interface StructuredDataLimits {
  relational: { maxIngestionBytes: number; maxIngestionRows: number };
  sql: {
    timeoutMilliseconds: number;
    maxResultRows: number;
    maxQueryCharacters: number;
  };
  worker: { maxResponseBytes: number };
  iceberg: { maxMetadataBytes: number; maxProbeEntries: number };
  netcdf: {
    maxSourceBytes: number;
    maxSliceCells: number;
    maxSliceBytes: number;
    maxProjectionRows: number;
    maxPlotCells: number;
  };
  exports: { maxRows: number; maxBytes: number };
  // Public URL prefixes readers may fetch directly instead of through the
  // backend content API; advertised by the backend per provider.
  directContentPrefixes?: string[];
  // Query engines must read direct content whole when the public origin
  // compresses responses or rejects ranged HEAD requests.
  directContentFullReads?: boolean;
}
