import type {
  StructuredInspection,
  StructuredPage,
  StructuredPageRequest,
  StructuredSourceDefinition
} from "../models";

export interface StructuredDataSource {
  inspect(signal: AbortSignal): Promise<StructuredInspection>;
  page(request: StructuredPageRequest, signal: AbortSignal): Promise<StructuredPage>;
  close(): Promise<void>;
}

export type StructuredSourceFactory = (
  definition: StructuredSourceDefinition,
  signal: AbortSignal,
  progress: (phase: string, loaded?: number, total?: number) => void
) => Promise<StructuredDataSource>;
