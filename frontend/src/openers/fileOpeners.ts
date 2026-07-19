import type { CapabilityStatus, StorageEntry } from "../api/types";
import { classifyEntry, extensionOf, isTextCategory } from "./fileTypeCatalog";
import type { FileCategory, FileTypeInfo } from "./fileTypeCatalog";

export type OpenerReadStrategy = "metadata" | "bounded" | "download";
export type OpenerMode = "viewer" | "editor";
export type OpenerView =
  | "archive"
  | "diff"
  | "json"
  | "log"
  | "markdown"
  | "media"
  | "pdf"
  | "structured-data"
  | "text"
  | "yaml";

export type OpenerRuntime = { kind: "inline" } | { kind: "lazy"; load: () => Promise<unknown> };

export interface FileOpener {
  id: string;
  label: string;
  priority: number;
  mode: OpenerMode;
  view: OpenerView;
  readStrategy: OpenerReadStrategy;
  editMode: "none" | "text" | "structured" | "export-only";
  saveStrategy: "none" | "overwrite" | "export-only";
  runtime: OpenerRuntime;
  maxSizeBytes?: number;
  mimeTypes?: string[];
  extensions?: string[];
  categories?: FileCategory[];
  requiredCapabilities: string[];
}

export interface FileOpenerMatch {
  opener: FileOpener;
  classification: FileTypeInfo;
  reason: string;
}

const textLimit = 512 * 1024;
const pdfLimit = 48 * 1024 * 1024;
const inlineRuntime: OpenerRuntime = { kind: "inline" };
const structuredDataRuntime: OpenerRuntime = {
  kind: "lazy",
  load: () => import("../formats/StructuredDataView")
};

function opener(definition: Omit<FileOpener, "runtime"> & { runtime?: OpenerRuntime }): FileOpener {
  return { runtime: inlineRuntime, ...definition };
}

export const firstPartyOpeners: FileOpener[] = [
  opener({
    id: "parquet",
    label: "Parquet data",
    priority: 5,
    view: "structured-data",
    mode: "viewer",
    editMode: "none",
    readStrategy: "metadata",
    saveStrategy: "export-only",
    runtime: structuredDataRuntime,
    mimeTypes: ["application/vnd.apache.parquet", "application/x-parquet"],
    extensions: [".parquet"],
    requiredCapabilities: ["download", "range-read"]
  }),
  opener({
    id: "avro",
    label: "Avro object container",
    priority: 6,
    view: "structured-data",
    mode: "viewer",
    editMode: "none",
    readStrategy: "metadata",
    saveStrategy: "export-only",
    runtime: structuredDataRuntime,
    mimeTypes: ["application/avro", "application/x-avro", "application/vnd.apache.avro"],
    extensions: [".avro"],
    requiredCapabilities: ["download"]
  }),
  opener({
    id: "arrow-ipc",
    label: "Arrow IPC data",
    priority: 7,
    view: "structured-data",
    mode: "viewer",
    editMode: "none",
    readStrategy: "metadata",
    saveStrategy: "export-only",
    runtime: structuredDataRuntime,
    mimeTypes: [
      "application/vnd.apache.arrow.file",
      "application/vnd.apache.arrow.stream",
      "application/vnd.apache.arrow",
      "application/x-apache-arrow"
    ],
    extensions: [".arrow", ".feather", ".ipc"],
    requiredCapabilities: ["download"]
  }),
  opener({
    id: "ndjson",
    label: "JSON Lines",
    priority: 8,
    view: "structured-data",
    mode: "viewer",
    editMode: "none",
    readStrategy: "metadata",
    saveStrategy: "export-only",
    runtime: structuredDataRuntime,
    mimeTypes: ["application/x-ndjson", "application/ndjson", "application/jsonl"],
    extensions: [".jsonl", ".ndjson"],
    categories: ["ndjson"],
    requiredCapabilities: ["download", "range-read"]
  }),
  opener({
    id: "delimited-text",
    label: "Delimited data",
    priority: 9,
    view: "structured-data",
    mode: "viewer",
    editMode: "none",
    readStrategy: "metadata",
    saveStrategy: "export-only",
    runtime: structuredDataRuntime,
    mimeTypes: ["text/csv", "application/csv", "text/tab-separated-values"],
    extensions: [".csv", ".tsv"],
    categories: ["csv"],
    requiredCapabilities: ["download", "range-read"]
  }),
  opener({
    id: "netcdf",
    label: "NetCDF dataset",
    priority: 9,
    view: "structured-data",
    mode: "viewer",
    editMode: "none",
    readStrategy: "metadata",
    saveStrategy: "export-only",
    runtime: structuredDataRuntime,
    mimeTypes: ["application/x-netcdf", "application/netcdf", "application/x-netcdf4"],
    extensions: [".nc", ".nc4", ".cdf"],
    requiredCapabilities: ["download"]
  }),
  opener({
    id: "markdown",
    label: "Markdown",
    priority: 10,
    view: "markdown",
    mode: "editor",
    editMode: "text",
    readStrategy: "bounded",
    saveStrategy: "overwrite",
    maxSizeBytes: textLimit,
    categories: ["markdown"],
    requiredCapabilities: ["bounded-read"]
  }),
  opener({
    id: "json",
    label: "JSON",
    priority: 20,
    view: "json",
    mode: "editor",
    editMode: "structured",
    readStrategy: "bounded",
    saveStrategy: "overwrite",
    maxSizeBytes: textLimit,
    categories: ["json"],
    requiredCapabilities: ["bounded-read"]
  }),
  opener({
    id: "yaml",
    label: "YAML",
    priority: 40,
    view: "yaml",
    mode: "editor",
    editMode: "text",
    readStrategy: "bounded",
    saveStrategy: "overwrite",
    maxSizeBytes: textLimit,
    categories: ["yaml"],
    requiredCapabilities: ["bounded-read"]
  }),
  opener({
    id: "diff",
    label: "Diff",
    priority: 45,
    view: "diff",
    mode: "viewer",
    editMode: "none",
    readStrategy: "bounded",
    saveStrategy: "none",
    maxSizeBytes: textLimit,
    extensions: [".diff", ".patch"],
    requiredCapabilities: ["bounded-read"]
  }),
  opener({
    id: "log",
    label: "Log explorer",
    priority: 48,
    view: "log",
    mode: "viewer",
    editMode: "none",
    readStrategy: "bounded",
    saveStrategy: "none",
    maxSizeBytes: textLimit,
    categories: ["log"],
    requiredCapabilities: ["bounded-read"]
  }),
  opener({
    id: "source-text",
    label: "Text editor",
    priority: 50,
    view: "text",
    mode: "editor",
    editMode: "text",
    readStrategy: "bounded",
    saveStrategy: "overwrite",
    maxSizeBytes: textLimit,
    categories: ["code", "config", "log", "text", "xml", "yaml"],
    requiredCapabilities: ["bounded-read"]
  }),
  opener({
    id: "image",
    label: "Image viewer",
    priority: 80,
    view: "media",
    mode: "viewer",
    editMode: "none",
    readStrategy: "download",
    saveStrategy: "none",
    categories: ["image"],
    requiredCapabilities: ["download"]
  }),
  opener({
    id: "pdf",
    label: "PDF viewer",
    priority: 90,
    view: "pdf",
    mode: "viewer",
    editMode: "none",
    readStrategy: "download",
    saveStrategy: "none",
    maxSizeBytes: pdfLimit,
    categories: ["pdf"],
    requiredCapabilities: ["download"]
  }),
  opener({
    id: "audio",
    label: "Audio player",
    priority: 100,
    view: "media",
    mode: "viewer",
    editMode: "none",
    readStrategy: "download",
    saveStrategy: "none",
    categories: ["audio"],
    requiredCapabilities: ["download"]
  }),
  opener({
    id: "video",
    label: "Video player",
    priority: 110,
    view: "media",
    mode: "viewer",
    editMode: "none",
    readStrategy: "download",
    saveStrategy: "none",
    categories: ["video"],
    requiredCapabilities: ["download"]
  }),
  opener({
    id: "archive-metadata",
    label: "Archive metadata",
    priority: 200,
    view: "archive",
    mode: "viewer",
    editMode: "none",
    readStrategy: "metadata",
    saveStrategy: "none",
    categories: ["archive"],
    requiredCapabilities: []
  })
];

export function loadFirstPartyOpenerRuntime(openerId: string): Promise<unknown> {
  const runtime = firstPartyOpeners.find((candidate) => candidate.id === openerId)?.runtime;
  if (!runtime) return Promise.reject(new Error(`Unknown first-party opener '${openerId}'.`));
  if (runtime.kind !== "lazy") return Promise.reject(new Error(`First-party opener '${openerId}' has no lazy runtime.`));
  return runtime.load();
}

export function resolveFileOpener(entry: StorageEntry): FileOpenerMatch | undefined {
  const classification = classifyEntry(entry);
  const candidates = firstPartyOpeners
    .filter((candidate) => openerMatches(candidate, entry, classification))
    .filter((candidate) => capabilitiesAvailable(entry.capabilities, candidate.requiredCapabilities))
    .filter((candidate) => sizeAllowed(entry, candidate))
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  const selected = candidates[0];
  if (!selected) return undefined;
  return { opener: selected, classification, reason: matchReason(selected, entry, classification) };
}

export function openerBlockedReason(entry: StorageEntry): string | undefined {
  const classification = classifyEntry(entry);
  const candidates = firstPartyOpeners.filter((candidate) => openerMatches(candidate, entry, classification));
  const sizeBlocked = candidates.find((candidate) => !sizeAllowed(entry, candidate));
  if (sizeBlocked?.maxSizeBytes) return `File exceeds ${formatLimit(sizeBlocked.maxSizeBytes)} opener limit.`;
  const capabilityBlocked = candidates.find(
    (candidate) => !capabilitiesAvailable(entry.capabilities, candidate.requiredCapabilities)
  );
  if (capabilityBlocked) {
    return `Storage provider lacks required capability: ${capabilityBlocked.requiredCapabilities.join(", ")}.`;
  }
  if (classification.category === "binary" || classification.category === "unknown") {
    return "No opener is registered for this file type.";
  }
  return "No compatible opener is available.";
}

export function canWriteBack(entry: StorageEntry, readOnlyRoot: boolean): boolean {
  return !readOnlyRoot && capabilitiesAvailable(entry.capabilities, ["overwrite"]);
}

export function openerSupportsRaw(opener: FileOpener): boolean {
  return ["json", "markdown", "structured-data", "text", "yaml", "diff", "log"].includes(opener.view);
}

function openerMatches(openerDefinition: FileOpener, entry: StorageEntry, classification: FileTypeInfo): boolean {
  const mimeType = normalizeMimeType(classification.mimeType);
  const extension = extensionOf(entry.name);
  const byCategory = openerDefinition.categories?.includes(classification.category) ?? false;
  const byMime = mimeType
    ? openerDefinition.mimeTypes?.some((pattern) => mimeMatches(mimeType, pattern)) ?? false
    : false;
  const byExtension = extension
    ? openerDefinition.extensions?.map((value) => value.toLowerCase()).includes(extension) ?? false
    : false;
  const byTextFallback =
    openerDefinition.id === "source-text" && classification.textLike && isTextCategory(classification.category);
  return byCategory || byMime || byExtension || byTextFallback;
}

function mimeMatches(mimeType: string, pattern: string): boolean {
  const normalized = normalizeMimeType(pattern);
  if (!normalized) return false;
  if (normalized === mimeType) return true;
  if (normalized.endsWith("/*")) return mimeType.startsWith(normalized.slice(0, -1));
  return false;
}

function normalizeMimeType(mimeType?: string | null): string | undefined {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  return normalized || undefined;
}

function capabilitiesAvailable(capabilities: CapabilityStatus[], required: string[]): boolean {
  const capabilityMap = new Map(capabilities.map((capability) => [capability.name, capability.status]));
  return required.every((name) => {
    const status = capabilityMap.get(name);
    return (
      status === "supported" ||
      status === "degraded" ||
      (name === "bounded-read" && capabilityMap.get("preview") === "supported")
    );
  });
}

function sizeAllowed(entry: StorageEntry, openerDefinition: FileOpener): boolean {
  if (openerDefinition.readStrategy !== "download" || !openerDefinition.maxSizeBytes) return true;
  const size = entry.metadata.size;
  return typeof size === "number" && size <= openerDefinition.maxSizeBytes;
}

function matchReason(openerDefinition: FileOpener, entry: StorageEntry, classification: FileTypeInfo): string {
  const extension = extensionOf(entry.name);
  if (openerDefinition.categories?.includes(classification.category)) return classification.label;
  if (
    classification.mimeType &&
    openerDefinition.mimeTypes?.some((pattern) => mimeMatches(classification.mimeType ?? "", pattern))
  ) {
    return classification.mimeType;
  }
  if (extension && openerDefinition.extensions?.includes(extension)) return extension;
  return classification.label;
}

function formatLimit(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
