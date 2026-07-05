package io.cagnard.backend.storage

case class FileTypeClassification(
    mimeType: Option[String],
    category: String,
    icon: String,
    label: String,
    source: String,
    confidence: String,
    textLike: Boolean
)

private case class FileTypeDefinition(
    mimeType: String,
    category: String,
    icon: String,
    label: String,
    textLike: Boolean
)

object FileTypeCatalog:
  private val fallback = FileTypeDefinition("application/octet-stream", "binary", "file", "Binary file", textLike = false)

  private val extensionDefinitions: Map[String, FileTypeDefinition] =
    Map(
      ".txt" -> text("text/plain", "Text"),
      ".text" -> text("text/plain", "Text"),
      ".log" -> text("text/plain", "Log", category = "log", icon = "file-text"),
      ".md" -> text("text/markdown", "Markdown", category = "markdown", icon = "file-text"),
      ".markdown" -> text("text/markdown", "Markdown", category = "markdown", icon = "file-text"),
      ".json" -> text("application/json", "JSON", category = "json", icon = "file-json"),
      ".jsonl" -> text("application/x-ndjson", "JSON Lines", category = "json", icon = "file-json"),
      ".ndjson" -> text("application/x-ndjson", "JSON Lines", category = "json", icon = "file-json"),
      ".csv" -> text("text/csv", "CSV", category = "csv", icon = "table"),
      ".tsv" -> text("text/tab-separated-values", "TSV", category = "csv", icon = "table"),
      ".xml" -> text("application/xml", "XML", category = "xml", icon = "file-code"),
      ".yaml" -> text("application/yaml", "YAML", category = "yaml", icon = "file-cog"),
      ".yml" -> text("application/yaml", "YAML", category = "yaml", icon = "file-cog"),
      ".toml" -> text("application/toml", "TOML", category = "config", icon = "file-cog"),
      ".ini" -> text("text/plain", "INI", category = "config", icon = "file-cog"),
      ".conf" -> text("text/plain", "Config", category = "config", icon = "file-cog"),
      ".properties" -> text("text/x-java-properties", "Properties", category = "config", icon = "file-cog"),
      ".env" -> text("text/plain", "Environment", category = "config", icon = "file-cog"),
      ".html" -> text("text/html", "HTML", category = "code", icon = "file-code"),
      ".htm" -> text("text/html", "HTML", category = "code", icon = "file-code"),
      ".css" -> text("text/css", "CSS", category = "code", icon = "file-code"),
      ".js" -> text("application/javascript", "JavaScript", category = "code", icon = "file-code"),
      ".jsx" -> text("text/jsx", "JSX", category = "code", icon = "file-code"),
      ".ts" -> text("application/typescript", "TypeScript", category = "code", icon = "file-code"),
      ".tsx" -> text("text/tsx", "TSX", category = "code", icon = "file-code"),
      ".scala" -> text("text/x-scala", "Scala", category = "code", icon = "file-code"),
      ".java" -> text("text/x-java-source", "Java", category = "code", icon = "file-code"),
      ".go" -> text("text/x-go", "Go", category = "code", icon = "file-code"),
      ".py" -> text("text/x-python", "Python", category = "code", icon = "file-code"),
      ".rb" -> text("text/x-ruby", "Ruby", category = "code", icon = "file-code"),
      ".rs" -> text("text/x-rust", "Rust", category = "code", icon = "file-code"),
      ".sh" -> text("application/x-sh", "Shell", category = "code", icon = "file-code"),
      ".sql" -> text("application/sql", "SQL", category = "code", icon = "file-code"),
      ".pdf" -> binary("application/pdf", "pdf", "file-text", "PDF"),
      ".png" -> binary("image/png", "image", "file-image", "PNG image"),
      ".jpg" -> binary("image/jpeg", "image", "file-image", "JPEG image"),
      ".jpeg" -> binary("image/jpeg", "image", "file-image", "JPEG image"),
      ".gif" -> binary("image/gif", "image", "file-image", "GIF image"),
      ".webp" -> binary("image/webp", "image", "file-image", "WebP image"),
      ".svg" -> text("image/svg+xml", "SVG image", category = "image", icon = "file-image"),
      ".bmp" -> binary("image/bmp", "image", "file-image", "Bitmap image"),
      ".ico" -> binary("image/vnd.microsoft.icon", "image", "file-image", "Icon"),
      ".mp3" -> binary("audio/mpeg", "audio", "file-audio", "MP3 audio"),
      ".wav" -> binary("audio/wav", "audio", "file-audio", "WAV audio"),
      ".ogg" -> binary("audio/ogg", "audio", "file-audio", "Ogg audio"),
      ".flac" -> binary("audio/flac", "audio", "file-audio", "FLAC audio"),
      ".m4a" -> binary("audio/mp4", "audio", "file-audio", "M4A audio"),
      ".mp4" -> binary("video/mp4", "video", "file-video", "MP4 video"),
      ".webm" -> binary("video/webm", "video", "file-video", "WebM video"),
      ".mov" -> binary("video/quicktime", "video", "file-video", "QuickTime video"),
      ".mkv" -> binary("video/x-matroska", "video", "file-video", "Matroska video"),
      ".avi" -> binary("video/x-msvideo", "video", "file-video", "AVI video"),
      ".zip" -> binary("application/zip", "archive", "file-archive", "ZIP archive"),
      ".tar" -> binary("application/x-tar", "archive", "file-archive", "TAR archive"),
      ".tar.gz" -> binary("application/gzip", "archive", "file-archive", "Compressed TAR archive"),
      ".tgz" -> binary("application/gzip", "archive", "file-archive", "Compressed TAR archive"),
      ".gz" -> binary("application/gzip", "archive", "file-archive", "Gzip archive"),
      ".rar" -> binary("application/vnd.rar", "archive", "file-archive", "RAR archive"),
      ".7z" -> binary("application/x-7z-compressed", "archive", "file-archive", "7-Zip archive"),
      ".doc" -> binary("application/msword", "document", "file-text", "Word document"),
      ".docx" -> binary("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document", "file-text", "Word document"),
      ".xls" -> binary("application/vnd.ms-excel", "spreadsheet", "file-spreadsheet", "Excel spreadsheet"),
      ".xlsx" -> binary("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "spreadsheet", "file-spreadsheet", "Excel spreadsheet"),
      ".ppt" -> binary("application/vnd.ms-powerpoint", "presentation", "file-text", "PowerPoint presentation"),
      ".pptx" -> binary("application/vnd.openxmlformats-officedocument.presentationml.presentation", "presentation", "file-text", "PowerPoint presentation"),
      ".parquet" -> binary("application/vnd.apache.parquet", "data", "file-box", "Parquet data"),
      ".avro" -> binary("application/avro", "data", "file-box", "Avro data"),
      ".orc" -> binary("application/vnd.apache.orc", "data", "file-box", "ORC data"),
      ".db" -> binary("application/vnd.sqlite3", "database", "file-box", "Database"),
      ".sqlite" -> binary("application/vnd.sqlite3", "database", "file-box", "SQLite database"),
      ".sqlite3" -> binary("application/vnd.sqlite3", "database", "file-box", "SQLite database")
    )

  private val exactMimeDefinitions: Map[String, FileTypeDefinition] =
    Map(
      "text/plain" -> text("text/plain", "Text"),
      "text/markdown" -> extensionDefinitions(".md"),
      "application/json" -> extensionDefinitions(".json"),
      "application/x-ndjson" -> extensionDefinitions(".jsonl"),
      "text/csv" -> extensionDefinitions(".csv"),
      "text/tab-separated-values" -> extensionDefinitions(".tsv"),
      "application/xml" -> extensionDefinitions(".xml"),
      "text/xml" -> extensionDefinitions(".xml"),
      "application/yaml" -> extensionDefinitions(".yaml"),
      "application/toml" -> extensionDefinitions(".toml"),
      "application/pdf" -> extensionDefinitions(".pdf"),
      "application/zip" -> extensionDefinitions(".zip"),
      "application/x-tar" -> extensionDefinitions(".tar"),
      "application/gzip" -> extensionDefinitions(".gz"),
      "application/octet-stream" -> fallback
    )

  def classify(fileName: String, providerMimeType: Option[String]): FileTypeClassification =
    val normalizedMime = providerMimeType.map(_.trim.toLowerCase).filter(_.nonEmpty)
    val extensionMatch = definitionForExtension(fileName)
    val preferExtension = shouldPreferExtension(normalizedMime, extensionMatch)
    val definition =
      if preferExtension then extensionMatch.get
      else normalizedMime.flatMap(definitionForMime).orElse(extensionMatch).getOrElse(fallback)
    val selectedMime =
      if preferExtension then Some(definition.mimeType)
      else normalizedMime.orElse(Option.when(definition != fallback)(definition.mimeType))
    val source =
      if preferExtension then "extension"
      else if normalizedMime.nonEmpty then "provider"
      else if extensionMatch.nonEmpty then "extension"
      else "unknown"
    val confidence =
      if preferExtension then "extension"
      else if normalizedMime.nonEmpty then "metadata"
      else if extensionMatch.nonEmpty then "extension"
      else "unknown"

    FileTypeClassification(
      mimeType = selectedMime,
      category = definition.category,
      icon = definition.icon,
      label = definition.label,
      source = source,
      confidence = confidence,
      textLike = definition.textLike || normalizedMime.exists(isTextMime)
    )

  def fallbackMimeType(fileName: String, providerMimeType: Option[String]): Option[String] =
    classify(fileName, providerMimeType).mimeType

  def isTextLike(fileName: String, mimeType: Option[String]): Boolean =
    classify(fileName, mimeType).textLike

  private def definitionForExtension(fileName: String): Option[FileTypeDefinition] =
    val lowerName = Option(fileName).getOrElse("").toLowerCase
    extensionDefinitions.keys.toList.sortBy(_.length).reverse.find(lowerName.endsWith).flatMap(extensionDefinitions.get)

  private def definitionForMime(mimeType: String): Option[FileTypeDefinition] =
    exactMimeDefinitions
      .get(mimeType)
      .orElse {
        if mimeType.startsWith("text/") then Some(text(mimeType, "Text"))
        else if mimeType.startsWith("image/") then Some(binary(mimeType, "image", "file-image", "Image"))
        else if mimeType.startsWith("audio/") then Some(binary(mimeType, "audio", "file-audio", "Audio"))
        else if mimeType.startsWith("video/") then Some(binary(mimeType, "video", "file-video", "Video"))
        else if mimeType.endsWith("+json") then Some(text(mimeType, "JSON", category = "json", icon = "file-json"))
        else if mimeType.endsWith("+xml") then Some(text(mimeType, "XML", category = "xml", icon = "file-code"))
        else None
      }

  private def shouldPreferExtension(mimeType: Option[String], extensionMatch: Option[FileTypeDefinition]): Boolean =
    extensionMatch.exists { definition =>
      mimeType.exists { value =>
        value == "application/octet-stream" ||
          value == "binary/octet-stream" ||
          (value.startsWith("text/") && definition.category != "text")
      }
    }

  private def isTextMime(mimeType: String): Boolean =
    mimeType.startsWith("text/") ||
      mimeType == "application/json" ||
      mimeType.endsWith("+json") ||
      mimeType == "application/xml" ||
      mimeType.endsWith("+xml") ||
      mimeType == "application/yaml" ||
      mimeType == "application/toml" ||
      mimeType == "application/javascript" ||
      mimeType == "application/typescript" ||
      mimeType == "application/sql" ||
      mimeType == "application/x-sh"

  private def text(mimeType: String, label: String, category: String = "text", icon: String = "file-text"): FileTypeDefinition =
    FileTypeDefinition(mimeType, category, icon, label, textLike = true)

  private def binary(mimeType: String, category: String, icon: String, label: String): FileTypeDefinition =
    FileTypeDefinition(mimeType, category, icon, label, textLike = false)
