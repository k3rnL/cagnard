import type { StorageEntry } from "../api/types";

export type FileCategory =
  | "archive"
  | "audio"
  | "binary"
  | "code"
  | "config"
  | "csv"
  | "data"
  | "database"
  | "document"
  | "image"
  | "json"
  | "log"
  | "markdown"
  | "pdf"
  | "presentation"
  | "spreadsheet"
  | "text"
  | "unknown"
  | "video"
  | "xml"
  | "yaml";

export interface FileTypeInfo {
  mimeType?: string;
  category: FileCategory;
  icon: string;
  label: string;
  source: "provider" | "extension" | "unknown";
  textLike: boolean;
}

interface FileTypeDefinition {
  mimeType: string;
  category: FileCategory;
  icon: string;
  label: string;
  textLike: boolean;
}

const extensionDefinitions: Record<string, FileTypeDefinition> = {
  ".txt": text("text/plain", "Text"),
  ".text": text("text/plain", "Text"),
  ".log": text("text/plain", "Log", "log", "file-text"),
  ".md": text("text/markdown", "Markdown", "markdown", "file-text"),
  ".markdown": text("text/markdown", "Markdown", "markdown", "file-text"),
  ".json": text("application/json", "JSON", "json", "file-json"),
  ".jsonl": text("application/x-ndjson", "JSON Lines", "json", "file-json"),
  ".ndjson": text("application/x-ndjson", "JSON Lines", "json", "file-json"),
  ".csv": text("text/csv", "CSV", "csv", "table"),
  ".tsv": text("text/tab-separated-values", "TSV", "csv", "table"),
  ".xml": text("application/xml", "XML", "xml", "file-code"),
  ".diff": text("text/x-diff", "Diff", "code", "file-code"),
  ".patch": text("text/x-diff", "Patch", "code", "file-code"),
  ".yaml": text("application/yaml", "YAML", "yaml", "file-cog"),
  ".yml": text("application/yaml", "YAML", "yaml", "file-cog"),
  ".toml": text("application/toml", "TOML", "config", "file-cog"),
  ".ini": text("text/plain", "INI", "config", "file-cog"),
  ".conf": text("text/plain", "Config", "config", "file-cog"),
  ".properties": text("text/x-java-properties", "Properties", "config", "file-cog"),
  ".env": text("text/plain", "Environment", "config", "file-cog"),
  ".html": text("text/html", "HTML", "code", "file-code"),
  ".css": text("text/css", "CSS", "code", "file-code"),
  ".js": text("application/javascript", "JavaScript", "code", "file-code"),
  ".jsx": text("text/jsx", "JSX", "code", "file-code"),
  ".ts": text("application/typescript", "TypeScript", "code", "file-code"),
  ".tsx": text("text/tsx", "TSX", "code", "file-code"),
  ".scala": text("text/x-scala", "Scala", "code", "file-code"),
  ".java": text("text/x-java-source", "Java", "code", "file-code"),
  ".go": text("text/x-go", "Go", "code", "file-code"),
  ".py": text("text/x-python", "Python", "code", "file-code"),
  ".rb": text("text/x-ruby", "Ruby", "code", "file-code"),
  ".rs": text("text/x-rust", "Rust", "code", "file-code"),
  ".sh": text("application/x-sh", "Shell", "code", "file-code"),
  ".sql": text("application/sql", "SQL", "code", "file-code"),
  ".pdf": binary("application/pdf", "pdf", "file-text", "PDF"),
  ".png": binary("image/png", "image", "file-image", "PNG image"),
  ".jpg": binary("image/jpeg", "image", "file-image", "JPEG image"),
  ".jpeg": binary("image/jpeg", "image", "file-image", "JPEG image"),
  ".gif": binary("image/gif", "image", "file-image", "GIF image"),
  ".webp": binary("image/webp", "image", "file-image", "WebP image"),
  ".svg": text("image/svg+xml", "SVG image", "image", "file-image"),
  ".bmp": binary("image/bmp", "image", "file-image", "Bitmap image"),
  ".mp3": binary("audio/mpeg", "audio", "file-audio", "MP3 audio"),
  ".wav": binary("audio/wav", "audio", "file-audio", "WAV audio"),
  ".ogg": binary("audio/ogg", "audio", "file-audio", "Ogg audio"),
  ".flac": binary("audio/flac", "audio", "file-audio", "FLAC audio"),
  ".mp4": binary("video/mp4", "video", "file-video", "MP4 video"),
  ".webm": binary("video/webm", "video", "file-video", "WebM video"),
  ".mov": binary("video/quicktime", "video", "file-video", "QuickTime video"),
  ".mkv": binary("video/x-matroska", "video", "file-video", "Matroska video"),
  ".zip": binary("application/zip", "archive", "file-archive", "ZIP archive"),
  ".tar": binary("application/x-tar", "archive", "file-archive", "TAR archive"),
  ".tar.gz": binary("application/gzip", "archive", "file-archive", "Compressed TAR archive"),
  ".tgz": binary("application/gzip", "archive", "file-archive", "Compressed TAR archive"),
  ".gz": binary("application/gzip", "archive", "file-archive", "Gzip archive"),
  ".rar": binary("application/vnd.rar", "archive", "file-archive", "RAR archive"),
  ".7z": binary("application/x-7z-compressed", "archive", "file-archive", "7-Zip archive"),
  ".doc": binary("application/msword", "document", "file-text", "Word document"),
  ".docx": binary("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document", "file-text", "Word document"),
  ".xls": binary("application/vnd.ms-excel", "spreadsheet", "file-spreadsheet", "Excel spreadsheet"),
  ".xlsx": binary("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "spreadsheet", "file-spreadsheet", "Excel spreadsheet"),
  ".ppt": binary("application/vnd.ms-powerpoint", "presentation", "file-text", "PowerPoint presentation"),
  ".pptx": binary("application/vnd.openxmlformats-officedocument.presentationml.presentation", "presentation", "file-text", "PowerPoint presentation"),
  ".parquet": binary("application/vnd.apache.parquet", "data", "file-box", "Parquet data"),
  ".avro": binary("application/avro", "data", "file-box", "Avro data"),
  ".orc": binary("application/vnd.apache.orc", "data", "file-box", "ORC data"),
  ".db": binary("application/vnd.sqlite3", "database", "file-box", "Database"),
  ".sqlite": binary("application/vnd.sqlite3", "database", "file-box", "SQLite database"),
  ".sqlite3": binary("application/vnd.sqlite3", "database", "file-box", "SQLite database")
};

const exactMimeDefinitions: Record<string, FileTypeDefinition> = {
  "text/plain": text("text/plain", "Text"),
  "text/markdown": extensionDefinitions[".md"],
  "application/json": extensionDefinitions[".json"],
  "application/x-ndjson": extensionDefinitions[".jsonl"],
  "text/csv": extensionDefinitions[".csv"],
  "text/tab-separated-values": extensionDefinitions[".tsv"],
  "application/xml": extensionDefinitions[".xml"],
  "text/xml": extensionDefinitions[".xml"],
  "application/yaml": extensionDefinitions[".yaml"],
  "application/toml": extensionDefinitions[".toml"],
  "application/pdf": extensionDefinitions[".pdf"],
  "application/zip": extensionDefinitions[".zip"],
  "application/x-tar": extensionDefinitions[".tar"],
  "application/gzip": extensionDefinitions[".gz"]
};

export function classifyEntry(entry: StorageEntry): FileTypeInfo {
  if (entry.kind === "directory") {
    return { category: "unknown", icon: "folder", label: "Folder", source: "unknown", textLike: false };
  }

  const metadataCategory = normalizeCategory(entry.metadata.fileCategory);
  if (metadataCategory) {
    const normalizedMime = normalizeMimeType(entry.metadata.mimeType);
    return {
      mimeType: normalizedMime,
      category: metadataCategory,
      icon: entry.metadata.fileIcon ?? iconForCategory(metadataCategory),
      label: labelForCategory(metadataCategory),
      source: entry.metadata.mimeTypeSource === "provider" ? "provider" : entry.metadata.mimeTypeSource === "extension" ? "extension" : "unknown",
      textLike: isTextCategory(metadataCategory) || isTextMime(normalizedMime)
    };
  }

  return classifyFile(entry.name, entry.metadata.mimeType ?? undefined);
}

export function classifyFile(name: string, providerMimeType?: string | null): FileTypeInfo {
  const normalizedMime = normalizeMimeType(providerMimeType);
  const extensionMatch = definitionForExtension(name);
  const preferExtension = shouldPreferExtension(normalizedMime, extensionMatch);
  const definition = preferExtension ? extensionMatch : (normalizedMime ? definitionForMime(normalizedMime) : undefined) ?? extensionMatch;

  if (!definition) {
    return {
      mimeType: normalizedMime,
      category: normalizedMime ? categoryForMime(normalizedMime) : "binary",
      icon: normalizedMime ? iconForCategory(categoryForMime(normalizedMime)) : "file",
      label: normalizedMime ? labelForCategory(categoryForMime(normalizedMime)) : "Unknown file",
      source: normalizedMime ? "provider" : "unknown",
      textLike: isTextMime(normalizedMime)
    };
  }

  return {
    mimeType: preferExtension ? definition.mimeType : normalizedMime ?? definition.mimeType,
    category: definition.category,
    icon: definition.icon,
    label: definition.label,
    source: preferExtension ? "extension" : normalizedMime ? "provider" : "extension",
    textLike: definition.textLike || isTextMime(normalizedMime)
  };
}

export function extensionOf(name: string): string | undefined {
  const lowerName = name.toLowerCase();
  return Object.keys(extensionDefinitions)
    .sort((left, right) => right.length - left.length)
    .find((extension) => lowerName.endsWith(extension));
}

const highlightLanguages: Record<string, string> = {
  ".css": "css",
  ".diff": "diff",
  ".go": "go",
  ".html": "xml",
  ".ini": "ini",
  ".java": "java",
  ".js": "javascript",
  ".json": "json",
  ".jsonl": "json",
  ".jsx": "javascript",
  ".md": "markdown",
  ".markdown": "markdown",
  ".patch": "diff",
  ".properties": "properties",
  ".py": "python",
  ".rb": "ruby",
  ".rs": "rust",
  ".scala": "scala",
  ".sh": "bash",
  ".sql": "sql",
  ".toml": "ini",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml"
};

export function highlightLanguageOf(name: string): string | undefined {
  const extension = extensionOf(name);
  return extension ? highlightLanguages[extension] : undefined;
}

export function isTextCategory(category: string | undefined): boolean {
  return ["code", "config", "csv", "json", "log", "markdown", "text", "xml", "yaml"].includes(category ?? "");
}

function normalizeCategory(value?: string | null): FileCategory | undefined {
  const category = value?.toLowerCase();
  return category && validCategories.has(category) ? (category as FileCategory) : undefined;
}

function definitionForExtension(name: string): FileTypeDefinition | undefined {
  const extension = extensionOf(name);
  return extension ? extensionDefinitions[extension] : undefined;
}

function definitionForMime(mimeType: string): FileTypeDefinition | undefined {
  return exactMimeDefinitions[mimeType] ?? mimeWildcardDefinition(mimeType);
}

function mimeWildcardDefinition(mimeType: string): FileTypeDefinition | undefined {
  if (mimeType.startsWith("text/")) return text(mimeType, "Text");
  if (mimeType.startsWith("image/")) return binary(mimeType, "image", "file-image", "Image");
  if (mimeType.startsWith("audio/")) return binary(mimeType, "audio", "file-audio", "Audio");
  if (mimeType.startsWith("video/")) return binary(mimeType, "video", "file-video", "Video");
  if (mimeType.endsWith("+json")) return text(mimeType, "JSON", "json", "file-json");
  if (mimeType.endsWith("+xml")) return text(mimeType, "XML", "xml", "file-code");
  return undefined;
}

function shouldPreferExtension(mimeType: string | undefined, extensionMatch: FileTypeDefinition | undefined): boolean {
  if (!mimeType || !extensionMatch) return false;
  return (
    mimeType === "application/octet-stream" ||
    mimeType === "binary/octet-stream" ||
    (mimeType.startsWith("text/") && extensionMatch.category !== "text")
  );
}

function categoryForMime(mimeType: string): FileCategory {
  return mimeWildcardDefinition(mimeType)?.category ?? (mimeType === "application/pdf" ? "pdf" : "binary");
}

function iconForCategory(category: FileCategory): string {
  switch (category) {
    case "archive":
      return "file-archive";
    case "audio":
      return "file-audio";
    case "code":
    case "xml":
      return "file-code";
    case "config":
    case "yaml":
      return "file-cog";
    case "csv":
      return "table";
    case "data":
    case "database":
      return "file-box";
    case "image":
      return "file-image";
    case "json":
      return "file-json";
    case "spreadsheet":
      return "file-spreadsheet";
    case "video":
      return "file-video";
    default:
      return "file-text";
  }
}

function labelForCategory(category: FileCategory): string {
  const labels: Record<FileCategory, string> = {
    archive: "Archive",
    audio: "Audio",
    binary: "Binary",
    code: "Code",
    config: "Config",
    csv: "CSV",
    data: "Data",
    database: "Database",
    document: "Document",
    image: "Image",
    json: "JSON",
    log: "Log",
    markdown: "Markdown",
    pdf: "PDF",
    presentation: "Presentation",
    spreadsheet: "Spreadsheet",
    text: "Text",
    unknown: "Unknown",
    video: "Video",
    xml: "XML",
    yaml: "YAML"
  };
  return labels[category];
}

function isTextMime(mimeType?: string | null): boolean {
  const value = normalizeMimeType(mimeType) ?? "";
  return (
    value.startsWith("text/") ||
    value === "application/json" ||
    value.endsWith("+json") ||
    value === "application/xml" ||
    value.endsWith("+xml") ||
    value === "application/yaml" ||
    value === "application/toml" ||
    value === "application/javascript" ||
    value === "application/typescript" ||
    value === "application/sql" ||
    value === "application/x-sh"
  );
}

function normalizeMimeType(mimeType?: string | null): string | undefined {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  return normalized || undefined;
}

function text(
  mimeType: string,
  label: string,
  category: FileCategory = "text",
  icon = "file-text"
): FileTypeDefinition {
  return { mimeType, category, icon, label, textLike: true };
}

function binary(mimeType: string, category: FileCategory, icon: string, label: string): FileTypeDefinition {
  return { mimeType, category, icon, label, textLike: false };
}

const validCategories = new Set<string>([
  "archive",
  "audio",
  "binary",
  "code",
  "config",
  "csv",
  "data",
  "database",
  "document",
  "image",
  "json",
  "log",
  "markdown",
  "pdf",
  "presentation",
  "spreadsheet",
  "text",
  "unknown",
  "video",
  "xml",
  "yaml"
]);
