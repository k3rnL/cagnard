package storage

import (
	"mime"
	"path/filepath"
	"strings"
)

type fileTypeDefinition struct {
	mimeType string
	category string
	icon     string
	textLike bool
}

var fallbackType = fileTypeDefinition{mimeType: "application/octet-stream", category: "binary", icon: "file", textLike: false}

var extensionTypes = map[string]fileTypeDefinition{
	".txt":   textType("text/plain", "text", "file-text"),
	".log":   textType("text/plain", "log", "file-text"),
	".md":    textType("text/markdown", "markdown", "file-text"),
	".json":  textType("application/json", "json", "file-json"),
	".jsonl": textType("application/x-ndjson", "json", "file-json"),
	".csv":   textType("text/csv", "csv", "table"),
	".tsv":   textType("text/tab-separated-values", "csv", "table"),
	".xml":   textType("application/xml", "xml", "file-code"),
	".diff":  textType("text/x-diff", "code", "file-code"),
	".patch": textType("text/x-diff", "code", "file-code"),
	".yaml":  textType("application/yaml", "yaml", "file-cog"),
	".yml":   textType("application/yaml", "yaml", "file-cog"),
	".toml":  textType("application/toml", "config", "file-cog"),
	".conf":  textType("text/plain", "config", "file-cog"),
	".env":   textType("text/plain", "config", "file-cog"),
	".html":  textType("text/html", "code", "file-code"),
	".css":   textType("text/css", "code", "file-code"),
	".js":    textType("application/javascript", "code", "file-code"),
	".ts":    textType("application/typescript", "code", "file-code"),
	".scala": textType("text/x-scala", "code", "file-code"),
	".java":  textType("text/x-java-source", "code", "file-code"),
	".go":    textType("text/x-go", "code", "file-code"),
	".py":    textType("text/x-python", "code", "file-code"),
	".sh":    textType("application/x-sh", "code", "file-code"),
	".sql":   textType("application/sql", "code", "file-code"),
	".svg":   textType("image/svg+xml", "image", "file-image"),
	".pdf":   binaryType("application/pdf", "pdf", "file-text"),
	".png":   binaryType("image/png", "image", "file-image"),
	".jpg":   binaryType("image/jpeg", "image", "file-image"),
	".jpeg":  binaryType("image/jpeg", "image", "file-image"),
	".gif":   binaryType("image/gif", "image", "file-image"),
	".webp":  binaryType("image/webp", "image", "file-image"),
	".mp3":   binaryType("audio/mpeg", "audio", "file-audio"),
	".wav":   binaryType("audio/wav", "audio", "file-audio"),
	".mp4":   binaryType("video/mp4", "video", "file-video"),
	".mov":   binaryType("video/quicktime", "video", "file-video"),
	".zip":   binaryType("application/zip", "archive", "file-archive"),
	".tar":   binaryType("application/x-tar", "archive", "file-archive"),
	".gz":    binaryType("application/gzip", "archive", "file-archive"),
	".doc":   binaryType("application/msword", "document", "file-text"),
	".docx":  binaryType("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document", "file-text"),
	".xls":   binaryType("application/vnd.ms-excel", "spreadsheet", "file-spreadsheet"),
	".xlsx":  binaryType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "spreadsheet", "file-spreadsheet"),
	".ppt":   binaryType("application/vnd.ms-powerpoint", "presentation", "file-text"),
	".pptx":  binaryType("application/vnd.openxmlformats-officedocument.presentationml.presentation", "presentation", "file-text"),
}

var exactMIMETypes = map[string]fileTypeDefinition{
	"text/markdown":                 extensionTypes[".md"],
	"application/json":              extensionTypes[".json"],
	"application/x-ndjson":          extensionTypes[".jsonl"],
	"text/csv":                      extensionTypes[".csv"],
	"text/tab-separated-values":     extensionTypes[".tsv"],
	"application/xml":               extensionTypes[".xml"],
	"text/xml":                      extensionTypes[".xml"],
	"application/yaml":              extensionTypes[".yaml"],
	"application/x-yaml":            extensionTypes[".yaml"],
	"application/toml":              extensionTypes[".toml"],
	"text/html":                     extensionTypes[".html"],
	"text/css":                      extensionTypes[".css"],
	"application/javascript":        extensionTypes[".js"],
	"text/javascript":               extensionTypes[".js"],
	"application/typescript":        extensionTypes[".ts"],
	"application/sql":               extensionTypes[".sql"],
	"application/x-sh":              extensionTypes[".sh"],
	"image/svg+xml":                 extensionTypes[".svg"],
	"application/pdf":               extensionTypes[".pdf"],
	"application/zip":               extensionTypes[".zip"],
	"application/x-tar":             extensionTypes[".tar"],
	"application/gzip":              extensionTypes[".gz"],
	"application/msword":            extensionTypes[".doc"],
	"application/vnd.ms-excel":      extensionTypes[".xls"],
	"application/vnd.ms-powerpoint": extensionTypes[".ppt"],
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":   extensionTypes[".docx"],
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         extensionTypes[".xlsx"],
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": extensionTypes[".pptx"],
}

func fallbackMIMEType(fileName string, providerMIMEType *string) *string {
	classification := classify(fileName, providerMIMEType)
	if classification.mimeType == "" {
		return nil
	}
	return &classification.mimeType
}

func isTextLike(fileName string, mimeType *string) bool {
	return classify(fileName, mimeType).textLike
}

// IsTextLike reports whether a file classifies as text content, for callers
// outside the storage package such as content search.
func IsTextLike(fileName string, mimeType *string) bool {
	return isTextLike(fileName, mimeType)
}

// MIMETypeFor returns the catalog MIME type inferred from a file name, for
// callers outside the storage package such as archive entry delivery.
func MIMETypeFor(fileName string) *string {
	return fallbackMIMEType(fileName, nil)
}

func classify(fileName string, providerMIMEType *string) fileTypeDefinition {
	extDefinition, hasExt := definitionForExtension(fileName)
	if providerMIMEType != nil {
		normalized := normalizeMIMEType(*providerMIMEType)
		if normalized != "" && normalized != "application/octet-stream" {
			definition := definitionForMIME(normalized)
			if hasExt && strings.HasPrefix(normalized, "text/") && extDefinition.category != "text" {
				return extDefinition
			}
			return definition
		}
	}
	if hasExt {
		return extDefinition
	}
	return fallbackType
}

func definitionForExtension(fileName string) (fileTypeDefinition, bool) {
	lower := strings.ToLower(fileName)
	for ext, definition := range extensionTypes {
		if strings.HasSuffix(lower, ext) {
			return definition, true
		}
	}
	ext := strings.ToLower(filepath.Ext(fileName))
	if ext == "" {
		return fileTypeDefinition{}, false
	}
	if value := mime.TypeByExtension(ext); value != "" {
		return definitionForMIME(value), true
	}
	return fileTypeDefinition{}, false
}

func definitionForMIME(mimeType string) fileTypeDefinition {
	normalized := normalizeMIMEType(mimeType)
	if definition, ok := exactMIMETypes[normalized]; ok {
		return definition
	}
	if strings.HasPrefix(normalized, "text/") {
		return textType(normalized, "text", "file-text")
	}
	if strings.HasSuffix(normalized, "+json") {
		return textType(normalized, "json", "file-json")
	}
	if strings.HasSuffix(normalized, "+xml") {
		return textType(normalized, "xml", "file-code")
	}
	if strings.HasPrefix(normalized, "image/") {
		return binaryType(normalized, "image", "file-image")
	}
	if strings.HasPrefix(normalized, "audio/") {
		return binaryType(normalized, "audio", "file-audio")
	}
	if strings.HasPrefix(normalized, "video/") {
		return binaryType(normalized, "video", "file-video")
	}
	return fileTypeDefinition{mimeType: normalized, category: fallbackType.category, icon: fallbackType.icon, textLike: false}
}

func normalizeMIMEType(mimeType string) string {
	normalized := strings.ToLower(strings.TrimSpace(mimeType))
	if index := strings.Index(normalized, ";"); index >= 0 {
		normalized = strings.TrimSpace(normalized[:index])
	}
	return normalized
}

func textType(mimeType string, category string, icon string) fileTypeDefinition {
	return fileTypeDefinition{mimeType: mimeType, category: category, icon: icon, textLike: true}
}

func binaryType(mimeType string, category string, icon string) fileTypeDefinition {
	return fileTypeDefinition{mimeType: mimeType, category: category, icon: icon, textLike: false}
}
