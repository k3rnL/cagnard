export type StructuredFormatId =
  | "parquet"
  | "avro"
  | "arrow-ipc"
  | "ndjson"
  | "delimited-text";

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
  options?: {
    delimiter?: "," | "\t" | ";" | "|";
    header?: boolean;
  };
}
