package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

var icebergVersionedMetadata = regexp.MustCompile(`^v([0-9]+)\.metadata\.json$`)
var icebergWindowsAbsolutePath = regexp.MustCompile(`^[A-Za-z]:/`)

type icebergMetadataSummary struct {
	FormatVersion       int                                   `json:"format-version"`
	TableUUID           string                                `json:"table-uuid"`
	Location            string                                `json:"location"`
	CurrentSnapshotID   json.Number                           `json:"current-snapshot-id"`
	Snapshots           []icebergSnapshotReference            `json:"snapshots"`
	MetadataLog         []icebergMetadataLogReference         `json:"metadata-log"`
	Statistics          []icebergStatisticsReference          `json:"statistics"`
	PartitionStatistics []icebergPartitionStatisticsReference `json:"partition-statistics"`
}

type icebergSnapshotReference struct {
	ManifestList string `json:"manifest-list"`
}

type icebergMetadataLogReference struct {
	MetadataFile string `json:"metadata-file"`
}

type icebergStatisticsReference struct {
	StatisticsPath string `json:"statistics-path"`
}

type icebergPartitionStatisticsReference struct {
	StatisticsPath string `json:"statistics-path"`
}

type icebergMetadataCandidate struct {
	version int
	path    string
}

func (s *Server) icebergProbe(w http.ResponseWriter, r *http.Request) {
	tablePath, err := confinedStoragePath(queryValue(r, "path"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "invalid_iceberg_path", Message: err.Error()})
		return
	}
	root, provider, ok := s.providerForRequest(w, r, queryValue(r, "tunnel"), queryValue(r, "rootId"), false)
	if !ok {
		return
	}
	if tablePath != "" {
		entry, statErr := provider.Stat(root, tablePath)
		if statErr != nil || entry.Kind != "directory" {
			writeJSON(w, http.StatusOK, IcebergProbeResponse{Status: "not-detected", Message: "This location is not an accessible folder.", TablePath: tablePath})
			return
		}
	}

	metadataDirectory := path.Join(tablePath, "metadata")
	entries, listErr := listAllIcebergMetadata(provider, root, metadataDirectory, int(s.structuredData.Iceberg.MaxProbeEntries))
	if listErr != nil {
		writeJSON(w, http.StatusOK, IcebergProbeResponse{Status: "not-detected", Message: "No Iceberg metadata directory was found.", TablePath: tablePath})
		return
	}
	candidates := make([]icebergMetadataCandidate, 0)
	hasVersionHint := false
	for _, entry := range entries {
		if entry.Kind != "file" {
			continue
		}
		if entry.Name == "version-hint.text" {
			hasVersionHint = true
			continue
		}
		match := icebergVersionedMetadata.FindStringSubmatch(entry.Name)
		if len(match) != 2 {
			continue
		}
		version, parseErr := strconv.Atoi(match[1])
		if parseErr == nil {
			candidates = append(candidates, icebergMetadataCandidate{version: version, path: entry.Path})
		}
	}
	if len(candidates) == 0 {
		status := "not-detected"
		message := "No versioned Iceberg metadata file was found."
		if hasVersionHint {
			status = "unsupported"
			message = "The Iceberg version hint does not reference an available metadata file."
		}
		writeJSON(w, http.StatusOK, IcebergProbeResponse{Status: status, Message: message, TablePath: tablePath})
		return
	}

	sort.Slice(candidates, func(i, j int) bool { return candidates[i].version > candidates[j].version })
	selected := candidates[0]
	if hasVersionHint {
		hintBytes, readErr := readProviderBytes(provider, root, path.Join(metadataDirectory, "version-hint.text"), 128)
		if readErr != nil {
			writeJSON(w, http.StatusOK, IcebergProbeResponse{Status: "unsupported", Message: "The Iceberg version hint could not be read.", TablePath: tablePath})
			return
		}
		hint, parseErr := strconv.Atoi(strings.TrimSpace(string(hintBytes)))
		if parseErr != nil {
			writeJSON(w, http.StatusOK, IcebergProbeResponse{Status: "unsupported", Message: "The Iceberg version hint is malformed.", TablePath: tablePath})
			return
		}
		found := false
		for _, candidate := range candidates {
			if candidate.version == hint {
				selected = candidate
				found = true
				break
			}
		}
		if !found {
			writeJSON(w, http.StatusOK, IcebergProbeResponse{Status: "unsupported", Message: "The Iceberg version hint references missing metadata.", TablePath: tablePath})
			return
		}
	}

	metadataBytes, readErr := readProviderBytes(provider, root, selected.path, s.structuredData.Iceberg.MaxMetadataBytes)
	if readErr != nil {
		writeJSON(w, http.StatusOK, IcebergProbeResponse{Status: "unsupported", Message: "The Iceberg metadata is too large or could not be read.", TablePath: tablePath})
		return
	}
	var metadata icebergMetadataSummary
	decoder := json.NewDecoder(strings.NewReader(string(metadataBytes)))
	decoder.UseNumber()
	if err := decoder.Decode(&metadata); err != nil || metadata.FormatVersion == 0 {
		writeJSON(w, http.StatusOK, IcebergProbeResponse{Status: "unsupported", Message: "The Iceberg metadata file is malformed.", TablePath: tablePath})
		return
	}
	if metadata.FormatVersion < 1 || metadata.FormatVersion > 2 {
		writeJSON(w, http.StatusOK, IcebergProbeResponse{Status: "unsupported", Message: fmt.Sprintf("Iceberg format version %d is not supported by the pinned browser runtime.", metadata.FormatVersion), TablePath: tablePath, FormatVersion: &metadata.FormatVersion})
		return
	}
	if referenceErr := validateIcebergMetadataReferences(metadata, root); referenceErr != nil {
		writeJSON(w, http.StatusOK, IcebergProbeResponse{
			Status:        "unsupported",
			Message:       "The Iceberg metadata contains a reference outside the selected table.",
			TablePath:     tablePath,
			MetadataPath:  &selected.path,
			FormatVersion: &metadata.FormatVersion,
		})
		return
	}

	token := base64.RawURLEncoding.EncodeToString([]byte("/" + tablePath))
	relativeMetadata := strings.TrimPrefix(selected.path, tablePath+"/")
	if tablePath == "" {
		relativeMetadata = selected.path
	}
	sourceURL := fmt.Sprintf(
		"/api/storage/iceberg/content/%s/%s/%s/%s",
		pathEscapeSegment(queryValue(r, "tunnel")),
		pathEscapeSegment(queryValue(r, "rootId")),
		token,
		strings.Join(escapePathSegments(relativeMetadata), "/"),
	)
	// Providers with public content serve the table directly; worker-based
	// readers cannot rely on the backend facade in every browser.
	if direct, ok := provider.(interface {
		PublicContentURL(storage.ResolvedStorageRoot, string) (string, bool)
	}); ok {
		if directURL, ok := direct.PublicContentURL(root, selected.path); ok {
			sourceURL = directURL
		}
	}
	metadataPath := selected.path
	var tableUUID *string
	if metadata.TableUUID != "" {
		tableUUID = &metadata.TableUUID
	}
	var snapshotID *string
	if value := metadata.CurrentSnapshotID.String(); value != "" {
		snapshotID = &value
	}
	message := "Iceberg table detected."
	status := "supported"
	if !hasVersionHint {
		status = "candidate"
		message = "Iceberg metadata was detected without a version hint; the newest explicit metadata version will be opened."
	}
	writeJSON(w, http.StatusOK, IcebergProbeResponse{
		Status: status, Message: message, TablePath: tablePath, MetadataPath: &metadataPath,
		SourceURL: &sourceURL, FormatVersion: &metadata.FormatVersion, TableUUID: tableUUID,
		CurrentSnapshotID: snapshotID, SnapshotCount: len(metadata.Snapshots),
	})
}

func (s *Server) icebergContent(w http.ResponseWriter, r *http.Request) {
	root, provider, ok := s.providerForRequest(w, r, r.PathValue("tunnel"), r.PathValue("rootId"), false)
	if !ok {
		return
	}
	tableBytes, err := base64.RawURLEncoding.DecodeString(r.PathValue("table"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "invalid_iceberg_source", Message: "The Iceberg table source is invalid."})
		return
	}
	decodedTable := strings.TrimPrefix(string(tableBytes), "/")
	tablePath, err := confinedStoragePath(decodedTable)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "invalid_iceberg_source", Message: err.Error()})
		return
	}
	relative, err := confinedRelativePath(r.PathValue("relative"))
	if err != nil {
		writeAPIError(w, http.StatusForbidden, APIError{Code: "iceberg_reference_denied", Message: err.Error()})
		return
	}
	objectPath := path.Join(tablePath, relative)
	if !pathWithin(tablePath, objectPath) {
		writeAPIError(w, http.StatusForbidden, APIError{Code: "iceberg_reference_denied", Message: "The Iceberg reference escapes the selected table."})
		return
	}
	serveIcebergObject(w, r, provider, root, objectPath)
}

func listAllIcebergMetadata(provider storage.StorageProvider, root storage.ResolvedStorageRoot, metadataDirectory string, maximumEntries int) ([]storage.StorageEntry, error) {
	entries := make([]storage.StorageEntry, 0)
	var cursor *string
	for len(entries) < maximumEntries {
		page, err := provider.ListPage(root, metadataDirectory, storage.ListOptions{PageSize: 500, Cursor: cursor, SortKey: "name", SortDirection: "asc"})
		if err != nil {
			return nil, err
		}
		entries = append(entries, page.Entries...)
		if page.NextCursor == nil {
			return entries, nil
		}
		cursor = page.NextCursor
	}
	return nil, fmt.Errorf("Iceberg metadata directory exceeds the %d entry probe limit", maximumEntries)
}

func readProviderBytes(provider storage.StorageProvider, root storage.ResolvedStorageRoot, objectPath string, maximum int64) ([]byte, error) {
	info, err := provider.ContentInfo(root, objectPath)
	if err != nil {
		return nil, err
	}
	if info.Size != nil && *info.Size > maximum {
		return nil, fmt.Errorf("content exceeds %d bytes", maximum)
	}
	length := maximum + 1
	if info.Size != nil && *info.Size < length {
		length = *info.Size
	}
	reader, _, err := provider.RangeRead(root, objectPath, 0, length)
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	bytes, err := io.ReadAll(io.LimitReader(reader, maximum+1))
	if err != nil {
		return nil, err
	}
	if int64(len(bytes)) > maximum {
		return nil, fmt.Errorf("content exceeds %d bytes", maximum)
	}
	return bytes, nil
}

func serveIcebergObject(w http.ResponseWriter, r *http.Request, provider storage.StorageProvider, root storage.ResolvedStorageRoot, objectPath string) {
	w.Header().Set("Cache-Control", "private, no-store")
	info, err := provider.ContentInfo(root, objectPath)
	if err != nil {
		writeAPIError(w, http.StatusNotFound, APIError{Code: "iceberg_object_not_found", Message: "The referenced Iceberg object was not found."})
		return
	}
	size := int64(-1)
	if info.Size != nil {
		size = *info.Size
	}
	var requested *byteRange
	if header := r.Header.Get("Range"); header != "" && size >= 0 {
		parsed, unsatisfiable := parseByteRange(header, size)
		if unsatisfiable {
			w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", size))
			writeAPIError(w, http.StatusRequestedRangeNotSatisfiable, APIError{Code: "storage_range_invalid", Message: "Requested range is not satisfiable"})
			return
		}
		requested = parsed
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, safeFileName(info.FileName)))
	w.Header().Set("Accept-Ranges", "bytes")
	if requested != nil {
		reader, _, readErr := provider.RangeRead(root, objectPath, requested.start, requested.end-requested.start+1)
		if readErr != nil {
			writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_download_failed", Message: readErr.Error()})
			return
		}
		defer reader.Close()
		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", requested.start, requested.end, size))
		w.Header().Set("Content-Length", strconv.FormatInt(requested.end-requested.start+1, 10))
		w.WriteHeader(http.StatusPartialContent)
		if r.Method != http.MethodHead {
			_, _ = io.Copy(w, reader)
		}
		return
	}
	if size >= 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	}
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = provider.StreamRead(root, objectPath, w, nil)
	}
}

func confinedStoragePath(value string) (string, error) {
	trimmed := strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	if strings.HasPrefix(trimmed, "/") {
		return "", fmt.Errorf("Absolute storage paths are not allowed")
	}
	cleaned := path.Clean(trimmed)
	if cleaned == "." {
		return "", nil
	}
	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", fmt.Errorf("The storage path escapes its root")
	}
	return cleaned, nil
}

func confinedRelativePath(value string) (string, error) {
	decoded, err := url.PathUnescape(value)
	if err != nil {
		return "", fmt.Errorf("The Iceberg reference is invalid or escaping")
	}
	if decoded != value {
		second, secondErr := url.PathUnescape(decoded)
		if secondErr != nil || second != decoded {
			return "", fmt.Errorf("The Iceberg reference is invalid or escaping")
		}
	}
	cleaned, err := confinedStoragePath(decoded)
	if err != nil || cleaned == "" {
		return "", fmt.Errorf("The Iceberg reference is invalid or escaping")
	}
	if err := validateRelativeIcebergReference(decoded); err != nil {
		return "", fmt.Errorf("External and credentialed Iceberg references are denied")
	}
	return cleaned, nil
}

func validateIcebergMetadataReferences(metadata icebergMetadataSummary, root storage.ResolvedStorageRoot) error {
	location, err := parseIcebergLocation(metadata.Location, root)
	if err != nil {
		return err
	}
	references := make([]string, 0, 1+len(metadata.Snapshots)+len(metadata.MetadataLog)+len(metadata.Statistics)+len(metadata.PartitionStatistics))
	for _, snapshot := range metadata.Snapshots {
		references = append(references, snapshot.ManifestList)
	}
	for _, entry := range metadata.MetadataLog {
		references = append(references, entry.MetadataFile)
	}
	for _, entry := range metadata.Statistics {
		references = append(references, entry.StatisticsPath)
	}
	for _, entry := range metadata.PartitionStatistics {
		references = append(references, entry.StatisticsPath)
	}
	for _, reference := range references {
		if reference == "" {
			continue
		}
		if err := validateIcebergMetadataReference(reference, location); err != nil {
			return err
		}
	}
	return nil
}

func parseIcebergLocation(reference string, root storage.ResolvedStorageRoot) (*url.URL, error) {
	if reference == "" {
		return nil, nil
	}
	parsed, err := url.Parse(reference)
	if err != nil {
		return nil, fmt.Errorf("invalid Iceberg location")
	}
	if !parsed.IsAbs() && parsed.Host == "" {
		return nil, validateRelativeIcebergReference(reference)
	}
	objectRoot, ok := root.Target.(storage.ObjectStoreRootTarget)
	if !ok || root.ProviderFamily != "s3" || !isS3Scheme(parsed.Scheme) {
		return nil, fmt.Errorf("external Iceberg location")
	}
	if parsed.User != nil || parsed.Host != objectRoot.Bucket || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, fmt.Errorf("credentialed or foreign Iceberg location")
	}
	if cleanAbsoluteReferencePath(parsed.Path) == "" {
		return nil, fmt.Errorf("invalid Iceberg location")
	}
	return parsed, nil
}

func validateIcebergMetadataReference(reference string, location *url.URL) error {
	parsed, err := url.Parse(reference)
	if err != nil {
		return fmt.Errorf("invalid Iceberg reference")
	}
	if !parsed.IsAbs() && parsed.Host == "" {
		return validateRelativeIcebergReference(reference)
	}
	if location == nil || !isS3Scheme(parsed.Scheme) || !isS3Scheme(location.Scheme) {
		return fmt.Errorf("external Iceberg reference")
	}
	if parsed.User != nil || parsed.Host != location.Host || parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("credentialed or foreign Iceberg reference")
	}
	locationPath := cleanAbsoluteReferencePath(location.Path)
	referencePath := cleanAbsoluteReferencePath(parsed.Path)
	if locationPath == "" || referencePath == "" || !pathWithin(locationPath, referencePath) {
		return fmt.Errorf("escaping Iceberg reference")
	}
	return nil
}

func validateRelativeIcebergReference(reference string) error {
	if strings.ContainsRune(reference, '\x00') || strings.Contains(reference, "\\") {
		return fmt.Errorf("invalid Iceberg reference")
	}
	parsed, err := url.Parse(reference)
	if err != nil || parsed.IsAbs() || parsed.Host != "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("external Iceberg reference")
	}
	if strings.HasPrefix(reference, "//") || icebergWindowsAbsolutePath.MatchString(reference) {
		return fmt.Errorf("absolute Iceberg reference")
	}
	cleaned := path.Clean(reference)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") || strings.HasPrefix(cleaned, "/") {
		return fmt.Errorf("escaping Iceberg reference")
	}
	return nil
}

func isS3Scheme(scheme string) bool {
	switch strings.ToLower(scheme) {
	case "s3", "s3a", "s3n":
		return true
	default:
		return false
	}
}

func cleanAbsoluteReferencePath(value string) string {
	cleaned := path.Clean("/" + strings.TrimPrefix(value, "/"))
	if cleaned == "/" {
		return ""
	}
	return strings.TrimPrefix(cleaned, "/")
}

func pathWithin(rootPath string, candidate string) bool {
	if rootPath == "" {
		return candidate != ".." && !strings.HasPrefix(candidate, "../")
	}
	return candidate == rootPath || strings.HasPrefix(candidate, rootPath+"/")
}

func escapePathSegments(value string) []string {
	parts := strings.Split(value, "/")
	for index, part := range parts {
		parts[index] = pathEscapeSegment(part)
	}
	return parts
}

func pathEscapeSegment(value string) string {
	return url.PathEscape(value)
}
