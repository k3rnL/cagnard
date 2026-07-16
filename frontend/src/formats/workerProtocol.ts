import type {
  StructuredErrorShape,
  StructuredInspection,
  StructuredPage,
  StructuredPageRequest,
  StructuredSourceDefinition
} from "./models";

export type StructuredWorkerRequest =
  | { id: string; type: "initialize"; source: StructuredSourceDefinition }
  | { id: string; type: "inspect"; sourceId: string }
  | { id: string; type: "page" | "query"; sourceId: string; request: StructuredPageRequest }
  | { id: string; type: "cancel"; targetId: string }
  | { id: string; type: "close"; sourceId: string };

export type StructuredWorkerResponse =
  | { id: string; type: "initialized" | "inspection"; inspection: StructuredInspection }
  | { id: string; type: "page"; page: StructuredPage }
  | { id: string; type: "closed" | "canceled" }
  | { id: string; type: "progress"; phase: string; loaded?: number; total?: number }
  | { id: string; type: "error"; error: StructuredErrorShape };

export function isTerminalWorkerResponse(response: StructuredWorkerResponse): boolean {
  return response.type !== "progress";
}

export const maxStructuredWorkerResponseBytes = 16 * 1024 * 1024;

export function structuredWorkerResponseBytes(response: StructuredWorkerResponse): number {
  return new TextEncoder().encode(JSON.stringify(response)).byteLength;
}

export function structuredWorkerResponseFits(response: StructuredWorkerResponse): boolean {
  return structuredWorkerResponseBytes(response) <= maxStructuredWorkerResponseBytes;
}
