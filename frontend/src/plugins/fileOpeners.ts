import type { CapabilityStatus, StorageEntry, UiPluginManifest } from "../api/types";
import { classifyEntry, extensionOf, isTextCategory } from "./fileTypeCatalog";
import type { FileCategory, FileTypeInfo } from "./fileTypeCatalog";

export type OpenerReadStrategy = "metadata" | "bounded" | "download";
export type OpenerMode = "viewer" | "editor";
export type OpenerView = "archive" | "csv" | "json" | "markdown" | "media" | "pdf" | "text";

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
const mediaLimit = 48 * 1024 * 1024;

export const builtInOpeners: FileOpener[] = [
  {
    id: "markdown",
    label: "Markdown",
    priority: 10,
    mode: "editor",
    view: "markdown",
    readStrategy: "bounded",
    editMode: "text",
    saveStrategy: "overwrite",
    maxSizeBytes: textLimit,
    categories: ["markdown"],
    requiredCapabilities: ["bounded-read"]
  },
  {
    id: "json",
    label: "JSON",
    priority: 20,
    mode: "editor",
    view: "json",
    readStrategy: "bounded",
    editMode: "structured",
    saveStrategy: "overwrite",
    maxSizeBytes: textLimit,
    categories: ["json"],
    requiredCapabilities: ["bounded-read"]
  },
  {
    id: "csv",
    label: "CSV table",
    priority: 30,
    mode: "viewer",
    view: "csv",
    readStrategy: "bounded",
    editMode: "none",
    saveStrategy: "none",
    maxSizeBytes: tableLimit,
    categories: ["csv"],
    requiredCapabilities: ["bounded-read"]
  },
  {
    id: "source-text",
    label: "Text editor",
    priority: 50,
    mode: "editor",
    view: "text",
    readStrategy: "bounded",
    editMode: "text",
    saveStrategy: "overwrite",
    maxSizeBytes: textLimit,
    categories: ["code", "config", "log", "text", "xml", "yaml"],
    requiredCapabilities: ["bounded-read"]
  },
  {
    id: "image",
    label: "Image viewer",
    priority: 80,
    mode: "viewer",
    view: "media",
    readStrategy: "download",
    editMode: "none",
    saveStrategy: "none",
    maxSizeBytes: mediaLimit,
    categories: ["image"],
    requiredCapabilities: ["download"]
  },
  {
    id: "pdf",
    label: "PDF viewer",
    priority: 90,
    mode: "viewer",
    view: "pdf",
    readStrategy: "download",
    editMode: "none",
    saveStrategy: "none",
    maxSizeBytes: mediaLimit,
    categories: ["pdf"],
    requiredCapabilities: ["download"]
  },
  {
    id: "audio",
    label: "Audio player",
    priority: 100,
    mode: "viewer",
    view: "media",
    readStrategy: "download",
    editMode: "none",
    saveStrategy: "none",
    maxSizeBytes: mediaLimit,
    categories: ["audio"],
    requiredCapabilities: ["download"]
  },
  {
    id: "video",
    label: "Video player",
    priority: 110,
    mode: "viewer",
    view: "media",
    readStrategy: "download",
    editMode: "none",
    saveStrategy: "none",
    maxSizeBytes: mediaLimit,
    categories: ["video"],
    requiredCapabilities: ["download"]
  },
  {
    id: "archive-metadata",
    label: "Archive metadata",
    priority: 200,
    mode: "viewer",
    view: "archive",
    readStrategy: "metadata",
    editMode: "none",
    saveStrategy: "none",
    categories: ["archive"],
    requiredCapabilities: []
  }
];

export function resolveFileOpener(entry: StorageEntry, plugins: UiPluginManifest[]): FileOpenerMatch | undefined {
  const classification = classifyEntry(entry);
  const candidates = [...builtInOpeners, ...pluginOpeners(plugins)]
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
  const candidates = [...builtInOpeners, ...pluginOpeners(plugins)].filter((opener) => openerMatches(opener, entry, classification));
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
  return opener.view === "json" || opener.view === "csv" || opener.view === "markdown" || opener.view === "text";
}

function pluginOpeners(plugins: UiPluginManifest[]): FileOpener[] {
  return plugins
    .filter((plugin) => plugin.kind === "opener" || plugin.kind === "preview")
    .map((plugin) => ({
      id: plugin.id,
      label: plugin.label,
      priority: plugin.priority + 500,
      mode: plugin.mode === "editor" ? "editor" : "viewer",
      view: "text",
      readStrategy: plugin.readStrategy === "download" ? "download" : "bounded",
      editMode: plugin.editMode === "text" ? "text" : "none",
      saveStrategy: plugin.saveStrategy === "overwrite" ? "overwrite" : "none",
      maxSizeBytes: plugin.maxSizeBytes ?? textLimit,
      mimeTypes: plugin.mimeTypes,
      extensions: plugin.extensions,
      categories: plugin.categories as FileCategory[] | undefined,
      requiredCapabilities: plugin.requiredCapabilities?.length ? plugin.requiredCapabilities : ["bounded-read"]
    }));
}

function openerMatches(opener: FileOpener, entry: StorageEntry, classification: FileTypeInfo): boolean {
  const mimeType = classification.mimeType?.toLowerCase();
  const extension = extensionOf(entry.name);
  const byCategory = opener.categories?.includes(classification.category) ?? false;
  const byMime = mimeType ? opener.mimeTypes?.some((pattern) => mimeMatches(mimeType, pattern)) ?? false : false;
  const byExtension = extension ? opener.extensions?.map((value) => value.toLowerCase()).includes(extension) ?? false : false;
  const byTextFallback = opener.id === "source-text" && classification.textLike && isTextCategory(classification.category);
  return byCategory || byMime || byExtension || byTextFallback;
}

function mimeMatches(mimeType: string, pattern: string): boolean {
  const normalized = pattern.toLowerCase();
  if (normalized === mimeType) return true;
  if (normalized.endsWith("/*")) return mimeType.startsWith(normalized.slice(0, -1));
  return false;
}

function capabilitiesAvailable(capabilities: CapabilityStatus[], required: string[]): boolean {
  const capabilityMap = new Map(capabilities.map((capability) => [capability.name, capability.status]));
  return required.every((name) => {
    const status = capabilityMap.get(name);
    return status === "supported" || status === "degraded" || (name === "bounded-read" && capabilityMap.get("preview") === "supported");
  });
}

function sizeAllowed(entry: StorageEntry, opener: FileOpener): boolean {
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
