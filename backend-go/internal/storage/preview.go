package storage

import "unicode/utf8"

func textPreviewPage(path string, mimeType *string, chunk []byte, offset int64, totalSize int64) TextPreview {
	truncated := offset+int64(len(chunk)) < totalSize
	if truncated {
		chunk = trimIncompleteRune(chunk)
	}
	return TextPreview{
		Path:       path,
		MIMEType:   mimeType,
		Content:    string(chunk),
		Truncated:  truncated,
		Offset:     offset,
		NextOffset: offset + int64(len(chunk)),
		TotalSize:  &totalSize,
	}
}

// trimIncompleteRune drops a trailing partial UTF-8 sequence so pagination
// never splits a rune across two pages. Content that is not valid UTF-8 is
// returned unchanged.
func trimIncompleteRune(data []byte) []byte {
	for end := len(data); end > 0 && len(data)-end < utf8.UTFMax; end-- {
		if r, size := utf8.DecodeLastRune(data[:end]); r != utf8.RuneError || size > 1 {
			return data[:end]
		}
	}
	return data
}
