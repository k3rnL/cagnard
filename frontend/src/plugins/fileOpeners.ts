import type { CapabilityStatus, StorageEntry, UiPluginManifest } from "../api/types";
import { classifyEntry, extensionOf, isTextCategory } from "./fileTypeCatalog";
import type { FileCategory, FileTypeInfo } from "./fileTypeCatalog";

export type OpenerReadStrategy = "metadata" | "bounded" | "download";
export type OpenerMode = "viewer" | "editor";
export type OpenerView = "archive" | "csv" | "diff" | "json" | "log" | "markdown" | "media" | "pdf" | "text" | "yaml";

export interface FileOpener {
  id: string;
  label: string;
  priority: number;
  mode: OpenerMode;
  view: OpenerView;
  readStrategy: OpenerReadStrategy;
  editMode: "none" | "text" | "structured" | "export-only";
  saveStrategy: "none" | "overwrite" | "export-only";
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
const tableLimit = 2 * 1024 * 1024;
const pdfLimit = 48 * 1024 * 1024;

const firstPartyDefaults = {
  kind: "opener",
  apiVersion: "1",
  mimeTypes: [] as string[],
  extensions: [] as string[],
  permissions: ["read"]
};

// First-party openers are ordinary manifests: the same shape the backend
// serves for configured plugins, resolved through the same mapping.
export const firstPartyOpenerManifests: UiPluginManifest[] = [
  {
    ...firstPartyDefaults,
    id: "markdown",
    label: "Markdown",
    priority: 10,
    view: "markdown",
    mode: "editor",
    editMode: "text",
    readStrategy: "bounded",
    saveStrategy: "overwrite",
    maxSizeBytes: textLimit,
    categories: ["markdown"]
  },
  {
    ...firstPartyDefaults,
    id: "json",
    label: "JSON",
    priority: 20,
    view: "json",
    mode: "editor",
    editMode: "structured",
    readStrategy: "bounded",
    saveStrategy: "overwrite",
    maxSizeBytes: textLimit,
    categories: ["json"]
  },
  {
    ...firstPartyDefaults,
    id: "csv",
    label: "CSV table",
    priority: 30,
    view: "csv",
    readStrategy: "bounded",
    maxSizeBytes: tableLimit,
    categories: ["csv"]
  },
  {
    ...firstPartyDefaults,
    id: "yaml",
    label: "YAML",
    priority: 40,
    view: "yaml",
    mode: "editor",
    editMode: "text",
    readStrategy: "bounded",
    saveStrategy: "overwrite",
    maxSizeBytes: textLimit,
    categories: ["yaml"]
  },
  {
    ...firstPartyDefaults,
    id: "diff",
    label: "Diff",
    priority: 45,
    view: "diff",
    readStrategy: "bounded",
    maxSizeBytes: textLimit,
    extensions: [".diff", ".patch"]
  },
  {
    ...firstPartyDefaults,
    id: "log",
    label: "Log explorer",
    priority: 48,
    view: "log",
    readStrategy: "bounded",
    maxSizeBytes: textLimit,
    categories: ["log"]
  },
  {
    ...firstPartyDefaults,
    id: "source-text",
    label: "Text editor",
    priority: 50,
    view: "text",
    mode: "editor",
    editMode: "text",
    readStrategy: "bounded",
    saveStrategy: "overwrite",
    maxSizeBytes: textLimit,
    categories: ["code", "config", "log", "text", "xml", "yaml"]
  },
  {
    ...firstPartyDefaults,
    id: "image",
    label: "Image viewer",
    priority: 80,
    view: "media",
    readStrategy: "download",
    categories: ["image"]
  },
  {
    ...firstPartyDefaults,
    id: "pdf",
    label: "PDF viewer",
    priority: 90,
    view: "pdf",
    readStrategy: "download",
    maxSizeBytes: pdfLimit,
    categories: ["pdf"]
  },
  {
    ...firstPartyDefaults,
    id: "audio",
    label: "Audio player",
    priority: 100,
    view: "media",
    readStrategy: "download",
    categories: ["audio"]
  },
  {
    ...firstPartyDefaults,
    id: "video",
    label: "Video player",
    priority: 110,
    view: "media",
    readStrategy: "download",
    categories: ["video"]
  },
  {
    ...firstPartyDefaults,
    id: "archive-metadata",
    label: "Archive metadata",
    priority: 200,
    view: "archive",
    readStrategy: "metadata",
    categories: ["archive"]
  }
];

export function resolveFileOpener(entry: StorageEntry, plugins: UiPluginManifest[]): FileOpenerMatch | undefined {
  const classification = classifyEntry(entry);
  const candidates = registeredOpeners(plugins)
    .filter((opener) => openerMatches(opener, entry, classification))
    .filter((opener) => capabilitiesAvailable(entry.capabilities, opener.requiredCapabilities))
    .filter((opener) => sizeAllowed(entry, opener))
    .sort((left, right) => left.priority - right.priority);

  const opener = candidates[0];
  if (!opener) return undefined;

  return {
    opener,
    classification,
    reason: matchReason(opener, entry, classification)
  };
}

export function openerBlockedReason(entry: StorageEntry, plugins: UiPluginManifest[]): string | undefined {
  const classification = classifyEntry(entry);
  const candidates = registeredOpeners(plugins).filter((opener) => openerMatches(opener, entry, classification));
  const sizeBlocked = candidates.find((opener) => !sizeAllowed(entry, opener));
  if (sizeBlocked?.maxSizeBytes) return `File exceeds ${formatLimit(sizeBlocked.maxSizeBytes)} opener limit.`;
  const capabilityBlocked = candidates.find((opener) => !capabilitiesAvailable(entry.capabilities, opener.requiredCapabilities));
  if (capabilityBlocked) return `Storage provider lacks required capability: ${capabilityBlocked.requiredCapabilities.join(", ")}.`;
  if (classification.category === "binary" || classification.category === "unknown") return "No opener is registered for this file type.";
  return "No compatible opener is available.";
}

export function canWriteBack(entry: StorageEntry, readOnlyRoot: boolean): boolean {
  return !readOnlyRoot && capabilitiesAvailable(entry.capabilities, ["overwrite"]);
}

export function openerSupportsRaw(opener: FileOpener): boolean {
  return (
    opener.view === "json" ||
    opener.view === "csv" ||
    opener.view === "markdown" ||
    opener.view === "text" ||
    opener.view === "yaml" ||
    opener.view === "diff" ||
    opener.view === "log"
  );
}

const openerViews: OpenerView[] = ["archive", "csv", "diff", "json", "log", "markdown", "media", "pdf", "text", "yaml"];

function registeredOpeners(plugins: UiPluginManifest[]): FileOpener[] {
  return [...firstPartyOpenerManifests, ...plugins]
    .filter((manifest) => manifest.kind === "opener" || manifest.kind === "preview")
    .map(manifestToOpener);
}

function manifestToOpener(manifest: UiPluginManifest): FileOpener {
  const view = openerViews.includes(manifest.view as OpenerView) ? (manifest.view as OpenerView) : "text";
  const readStrategy: OpenerReadStrategy =
    manifest.readStrategy === "download" ? "download" : manifest.readStrategy === "metadata" ? "metadata" : "bounded";
  return {
    id: manifest.id,
    label: manifest.label,
    priority: manifest.priority,
    mode: manifest.mode === "editor" ? "editor" : "viewer",
    view,
    readStrategy,
    editMode:
      manifest.editMode === "text" || manifest.editMode === "structured" || manifest.editMode === "export-only"
        ? manifest.editMode
        : "none",
    saveStrategy: manifest.saveStrategy === "overwrite" || manifest.saveStrategy === "export-only" ? manifest.saveStrategy : "none",
    maxSizeBytes: defaultSizeLimit(manifest.maxSizeBytes, readStrategy),
    mimeTypes: manifest.mimeTypes,
    extensions: manifest.extensions,
    categories: manifest.categories as FileCategory[] | undefined,
    requiredCapabilities: manifest.requiredCapabilities?.length
      ? manifest.requiredCapabilities
      : defaultCapabilities(readStrategy)
  };
}

function defaultSizeLimit(declared: number | undefined, readStrategy: OpenerReadStrategy): number | undefined {
  if (declared && declared > 0) return declared;
  // Bounded openers buffer content in the browser, so an undeclared limit
  // falls back to the text cap; streamed and metadata reads need none.
  return readStrategy === "bounded" ? textLimit : undefined;
}

function defaultCapabilities(readStrategy: OpenerReadStrategy): string[] {
  if (readStrategy === "download") return ["download"];
  if (readStrategy === "metadata") return [];
  return ["bounded-read"];
}

function openerMatches(opener: FileOpener, entry: StorageEntry, classification: FileTypeInfo): boolean {
  const mimeType = normalizeMimeType(classification.mimeType);
  const extension = extensionOf(entry.name);
  const byCategory = opener.categories?.includes(classification.category) ?? false;
  const byMime = mimeType ? opener.mimeTypes?.some((pattern) => mimeMatches(mimeType, pattern)) ?? false : false;
  const byExtension = extension ? opener.extensions?.map((value) => value.toLowerCase()).includes(extension) ?? false : false;
  const byTextFallback = opener.id === "source-text" && classification.textLike && isTextCategory(classification.category);
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
    return status === "supported" || status === "degraded" || (name === "bounded-read" && capabilityMap.get("preview") === "supported");
  });
}

function sizeAllowed(entry: StorageEntry, opener: FileOpener): boolean {
  // Bounded openers paginate: a large file opens at its first page with a
  // "Load more" control rather than being refused. Only openers that must
  // load the whole file up front (download strategy, e.g. PDF) enforce a hard
  // size limit here.
  if (opener.readStrategy !== "download") return true;
  if (!opener.maxSizeBytes) return true;
  const size = entry.metadata.size;
  return typeof size === "number" && size <= opener.maxSizeBytes;
}

function matchReason(opener: FileOpener, entry: StorageEntry, classification: FileTypeInfo): string {
  const extension = extensionOf(entry.name);
  if (opener.categories?.includes(classification.category)) return classification.label;
  if (classification.mimeType && opener.mimeTypes?.some((pattern) => mimeMatches(classification.mimeType ?? "", pattern))) return classification.mimeType;
  if (extension && opener.extensions?.includes(extension)) return extension;
  return classification.label;
}

function formatLimit(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
