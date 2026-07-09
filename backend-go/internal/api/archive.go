package api

import (
	"fmt"
	"net/http"

	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

func (s *Server) archiveEntries(w http.ResponseWriter, r *http.Request) {
	root, provider, ok := s.providerForRequest(w, r, queryValue(r, "tunnel"), queryValue(r, "rootId"), false)
	if !ok {
		return
	}
	path := queryValue(r, "path")
	entries, err := storage.ListArchiveEntries(provider, root, path, queryValue(r, "entryPath"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_archive_failed", Message: err.Error()})
		return
	}
	out := make([]ArchiveEntryResponse, 0, len(entries))
	for _, entry := range entries {
		out = append(out, ArchiveEntryResponse{Path: entry.Path, Name: entry.Name, Kind: entry.Kind, Size: entry.Size})
	}
	writeJSON(w, http.StatusOK, ArchiveEntriesResponse{Path: path, EntryPath: queryValue(r, "entryPath"), Entries: out})
}

func (s *Server) archiveEntryContent(w http.ResponseWriter, r *http.Request) {
	root, provider, ok := s.providerForRequest(w, r, queryValue(r, "tunnel"), queryValue(r, "rootId"), false)
	if !ok {
		return
	}
	content, fileName, err := storage.ReadArchiveEntry(provider, root, queryValue(r, "path"), queryValue(r, "entryPath"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_archive_failed", Message: err.Error()})
		return
	}
	contentType := "application/octet-stream"
	if mimeType := storage.MIMETypeFor(fileName); mimeType != nil && *mimeType != "" {
		contentType = *mimeType
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, safeFileName(fileName)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}
