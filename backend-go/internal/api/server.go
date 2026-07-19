package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/k3rnl/cagnard/backend-go/internal/auth"
	"github.com/k3rnl/cagnard/backend-go/internal/config"
	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

const previewMaxBytes = 256 * 1024
const defaultEntryPageSize = 100
const maxEntryPageSize = 500

type Server struct {
	cfg            *config.CagnardConfig
	mux            *http.ServeMux
	resolver       *auth.UserResolver
	access         *auth.AccessService
	registry       *storage.Registry
	tasks          *taskManager
	structuredData config.StructuredDataConfig
}

func NewServer(cfg *config.CagnardConfig) *Server {
	s := &Server{
		cfg:            cfg,
		mux:            http.NewServeMux(),
		resolver:       auth.NewUserResolver(cfg),
		access:         auth.NewAccessService(cfg),
		registry:       storage.NewRegistry(cfg),
		tasks:          newTaskManager(),
		structuredData: cfg.EffectiveStructuredData(),
	}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.mux
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/health", s.health)
	s.mux.HandleFunc("GET /api/appearance", s.appearance)
	s.mux.HandleFunc("GET /api/structured-data/config", s.structuredDataConfig)
	s.mux.HandleFunc("GET /api/session", s.session)
	s.mux.HandleFunc("GET /api/auth/providers", s.authProviders)
	s.mux.HandleFunc("POST /api/auth/login", s.login)
	s.mux.HandleFunc("POST /api/auth/logout", s.logout)
	s.mux.HandleFunc("GET /api/storage/navigation", s.navigation)
	s.mux.HandleFunc("GET /api/storage/entries", s.listEntries)
	s.mux.HandleFunc("GET /api/storage/stat", s.statEntry)
	s.mux.HandleFunc("GET /api/storage/content", s.downloadContent)
	s.mux.HandleFunc("HEAD /api/storage/content", s.downloadContent)
	s.mux.HandleFunc("PUT /api/storage/content", s.uploadContent)
	s.mux.HandleFunc("GET /api/storage/preview", s.previewContent)
	s.mux.HandleFunc("GET /api/storage/content/search", s.contentSearch)
	s.mux.HandleFunc("GET /api/storage/iceberg/probe", s.icebergProbe)
	s.mux.HandleFunc("GET /api/storage/iceberg/content/{tunnel}/{rootId}/{table}/{relative...}", s.icebergContent)
	s.mux.HandleFunc("HEAD /api/storage/iceberg/content/{tunnel}/{rootId}/{table}/{relative...}", s.icebergContent)
	s.mux.HandleFunc("GET /api/storage/watch", s.watchStorage)
	s.mux.HandleFunc("GET /api/storage/archive/entries", s.archiveEntries)
	s.mux.HandleFunc("GET /api/storage/archive/entry", s.archiveEntryContent)
	s.mux.HandleFunc("POST /api/storage/folders", s.createFolder)
	s.mux.HandleFunc("POST /api/storage/rename", s.renameEntry)
	s.mux.HandleFunc("POST /api/storage/delete", s.deleteEntry)
	s.mux.HandleFunc("POST /api/storage/copy", s.copyEntry)
	s.mux.HandleFunc("POST /api/storage/move", s.moveEntry)
	s.mux.HandleFunc("POST /api/storage/transfer", s.transferEntries)
	s.mux.HandleFunc("POST /api/storage/transfer/jobs", s.startTransferJob)
	s.mux.HandleFunc("POST /api/storage/transfer/jobs/clear", s.clearTransferJobs)
	s.mux.HandleFunc("GET /api/storage/transfer/jobs", s.transferJobList)
	s.mux.HandleFunc("GET /api/storage/transfer/jobs/{jobId}", s.transferJob)
	s.mux.HandleFunc("POST /api/storage/transfer/jobs/{jobId}/cancel", s.cancelTransferJob)
	s.mux.HandleFunc("POST /api/storage/transfer/jobs/{jobId}/resolve", s.resolveTransferJob)
	s.mux.HandleFunc("POST /api/tasks/transfers", s.startTransferJob)
	s.mux.HandleFunc("POST /api/tasks/deletes", s.startDeleteTask)
	s.mux.HandleFunc("POST /api/tasks/downloads", s.startDownloadTask)
	s.mux.HandleFunc("POST /api/tasks/uploads", s.startUploadTask)
	s.mux.HandleFunc("PUT /api/tasks/{taskId}/uploads/{itemId}", s.uploadTaskItem)
	s.mux.HandleFunc("GET /api/tasks/{taskId}/content", s.downloadTaskContent)
	s.mux.HandleFunc("POST /api/tasks/clear", s.clearTasks)
	s.mux.HandleFunc("GET /api/tasks", s.taskList)
	s.mux.HandleFunc("GET /api/tasks/{taskId}", s.taskDetail)
	s.mux.HandleFunc("GET /api/tasks/{taskId}/items", s.taskItems)
	s.mux.HandleFunc("POST /api/tasks/{taskId}/cancel", s.cancelTask)
	s.mux.HandleFunc("POST /api/tasks/{taskId}/resolve", s.resolveTask)
}

func (s *Server) structuredDataConfig(w http.ResponseWriter, r *http.Request) {
	cfg := s.structuredData
	writeJSON(w, http.StatusOK, StructuredDataConfigResponse{
		Relational: StructuredRelationalConfigResponse{
			MaxIngestionBytes: cfg.Relational.MaxIngestionBytes,
			MaxIngestionRows:  cfg.Relational.MaxIngestionRows,
		},
		SQL: StructuredSQLConfigResponse{
			TimeoutMilliseconds: cfg.SQL.TimeoutMilliseconds,
			MaxResultRows:       cfg.SQL.MaxResultRows,
			MaxQueryCharacters:  cfg.SQL.MaxQueryCharacters,
		},
		Worker: StructuredWorkerConfigResponse{MaxResponseBytes: cfg.Worker.MaxResponseBytes},
		Iceberg: StructuredIcebergConfigResponse{
			MaxMetadataBytes: cfg.Iceberg.MaxMetadataBytes,
			MaxProbeEntries:  cfg.Iceberg.MaxProbeEntries,
		},
		NetCDF: StructuredNetCDFConfigResponse{
			MaxSourceBytes:    cfg.NetCDF.MaxSourceBytes,
			MaxSliceCells:     cfg.NetCDF.MaxSliceCells,
			MaxSliceBytes:     cfg.NetCDF.MaxSliceBytes,
			MaxProjectionRows: cfg.NetCDF.MaxProjectionRows,
			MaxPlotCells:      cfg.NetCDF.MaxPlotCells,
		},
		Exports: StructuredExportConfigResponse{
			MaxRows:  cfg.Exports.MaxRows,
			MaxBytes: cfg.Exports.MaxBytes,
		},
	})
}

func (s *Server) appearance(w http.ResponseWriter, r *http.Request) {
	appearance := s.cfg.EffectiveAppearance()
	writeJSON(w, http.StatusOK, AppearanceResponse{
		DefaultPalette:    string(appearance.DefaultPalette),
		DefaultMode:       string(appearance.DefaultMode),
		AllowUserOverride: appearance.AllowUserOverride,
	})
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, HealthResponse{
		Status:          "ok",
		Stateless:       true,
		Providers:       len(s.cfg.Providers),
		ConfiguredUsers: len(s.cfg.Users),
	})
}

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	resolved, failure := s.resolver.Resolve(requestIdentity(r))
	if failure != nil {
		writeAuthFailure(w, failure)
		return
	}
	writeJSON(w, http.StatusOK, s.sessionFor(resolved))
}

func (s *Server) authProviders(w http.ResponseWriter, r *http.Request) {
	providers := make([]AuthProviderMetadata, 0)
	for _, provider := range s.resolver.Providers() {
		providers = append(providers, authProviderMetadata(provider))
	}
	writeJSON(w, http.StatusOK, AuthProvidersResponse{Providers: providers})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var request LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "invalid_request", Message: "Login request body is invalid"})
		return
	}
	username := trimPtr(request.Username)
	password := stringPtr(request.Password)
	if !s.providerEnabled(request.ProviderID) || username == "" || password == "" {
		writeAPIError(w, http.StatusUnauthorized, APIError{Code: "authentication_failed", Message: "Invalid username or password"})
		return
	}

	resolved, token, failure := s.resolver.LoginStatic(username, password)
	if failure != nil {
		writeAuthFailure(w, failure)
		return
	}
	w.Header().Set("Set-Cookie", s.resolver.SessionCookie(token))
	writeJSON(w, http.StatusOK, LoginResponse{Session: s.sessionFor(resolved)})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Set-Cookie", s.resolver.ClearSessionCookie())
	writeJSON(w, http.StatusOK, LogoutResponse{Success: true})
}

func (s *Server) navigation(w http.ResponseWriter, r *http.Request) {
	resolved, failure := s.resolver.Resolve(requestIdentity(r))
	if failure != nil {
		writeAuthFailure(w, failure)
		return
	}
	personal := s.navigationSection("Home", s.access.PersonalRoots(resolved.Profile))
	global := s.navigationSection("Global", s.access.GlobalRoots(resolved.Profile))
	writeJSON(w, http.StatusOK, NavigationResponse{Personal: personal, Global: global})
}

func (s *Server) listEntries(w http.ResponseWriter, r *http.Request) {
	root, provider, ok := s.providerForRequest(w, r, queryValue(r, "tunnel"), queryValue(r, "rootId"), false)
	if !ok {
		return
	}
	path := queryValue(r, "path")
	listOptions, err := s.listOptionsForRequest(r, root, path)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "invalid_page_ref", Message: err.Error()})
		return
	}
	page, err := provider.ListPage(root, path, listOptions)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_list_failed", Message: err.Error()})
		return
	}
	pageMetadata, err := s.entryListPageMetadata(r, root, path, listOptions, page)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_list_failed", Message: err.Error()})
		return
	}
	capabilities, _ := s.registry.NavigationRoot(root)
	writeJSON(w, http.StatusOK, EntryListResponse{Root: navigationRoot(root, capabilities), Path: path, Entries: storageEntries(page.Entries), Page: pageMetadata})
}

func (s *Server) statEntry(w http.ResponseWriter, r *http.Request) {
	root, provider, ok := s.providerForRequest(w, r, queryValue(r, "tunnel"), queryValue(r, "rootId"), false)
	if !ok {
		return
	}
	entry, err := provider.Stat(root, queryValue(r, "path"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_stat_failed", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, storageEntry(entry))
}

func (s *Server) downloadContent(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	root, provider, ok := s.providerForRequest(w, r, queryValue(r, "tunnel"), queryValue(r, "rootId"), false)
	if !ok {
		return
	}
	path := queryValue(r, "path")
	info, err := provider.ContentInfo(root, path)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_download_failed", Message: err.Error()})
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
	var rangeReader io.ReadCloser
	if requested != nil && r.Method != http.MethodHead {
		reader, _, err := provider.RangeRead(root, path, requested.start, requested.end-requested.start+1)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_download_failed", Message: err.Error()})
			return
		}
		rangeReader = reader
		defer rangeReader.Close()
	}
	contentType := "application/octet-stream"
	if info.MIMEType != nil && *info.MIMEType != "" {
		contentType = *info.MIMEType
	}
	disposition := "attachment"
	if queryBool(r, "inline") {
		disposition = "inline"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"`, disposition, safeFileName(info.FileName)))
	w.Header().Set("Accept-Ranges", "bytes")
	if requested != nil {
		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", requested.start, requested.end, size))
		w.Header().Set("Content-Length", strconv.FormatInt(requested.end-requested.start+1, 10))
		w.WriteHeader(http.StatusPartialContent)
		if r.Method == http.MethodHead {
			return
		}
		_, _ = io.Copy(w, rangeReader)
		return
	}
	if size >= 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	}
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		return
	}
	_, _ = provider.StreamRead(root, path, w, nil)
}

type byteRange struct {
	start int64
	end   int64
}

// parseByteRange interprets a single-range "bytes=" header against the total
// content size. A nil range with unsatisfiable=false means the header should
// be ignored (malformed or multi-range) and the full content served; a nil
// range with unsatisfiable=true requires a 416 response.
func parseByteRange(header string, size int64) (parsed *byteRange, unsatisfiable bool) {
	spec, ok := strings.CutPrefix(strings.TrimSpace(header), "bytes=")
	if !ok || strings.Contains(spec, ",") {
		return nil, false
	}
	first, last, ok := strings.Cut(strings.TrimSpace(spec), "-")
	if !ok {
		return nil, false
	}
	first = strings.TrimSpace(first)
	last = strings.TrimSpace(last)
	if first == "" {
		suffix, err := strconv.ParseInt(last, 10, 64)
		if err != nil {
			return nil, false
		}
		if suffix <= 0 || size == 0 {
			return nil, true
		}
		if suffix > size {
			suffix = size
		}
		return &byteRange{start: size - suffix, end: size - 1}, false
	}
	start, err := strconv.ParseInt(first, 10, 64)
	if err != nil {
		return nil, false
	}
	if start >= size {
		return nil, true
	}
	end := size - 1
	if last != "" {
		parsedEnd, err := strconv.ParseInt(last, 10, 64)
		if err != nil || parsedEnd < start {
			return nil, false
		}
		if parsedEnd < end {
			end = parsedEnd
		}
	}
	return &byteRange{start: start, end: end}, false
}

func (s *Server) uploadContent(w http.ResponseWriter, r *http.Request) {
	root, provider, ok := s.providerForRequest(w, r, queryValue(r, "tunnel"), queryValue(r, "rootId"), true)
	if !ok {
		return
	}
	uploadPath := queryValue(r, "path")
	var size *int64
	if r.ContentLength >= 0 {
		value := r.ContentLength
		size = &value
	}
	var mimeType *string
	if value := strings.TrimSpace(r.Header.Get("Content-Type")); value != "" {
		mimeType = &value
	}
	entry, err := provider.StreamWriteContext(r.Context(), root, uploadPath, r.Body, storage.FileContentInfo{
		FileName: path.Base(uploadPath),
		MIMEType: mimeType,
		Size:     size,
	}, queryBool(r, "overwrite"), nil)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, operationError(err))
		return
	}
	out := storageEntry(entry)
	writeJSON(w, http.StatusOK, OperationResponse{Success: true, Message: "Uploaded " + entry.Name, Entry: &out})
}

func (s *Server) previewContent(w http.ResponseWriter, r *http.Request) {
	root, provider, ok := s.providerForRequest(w, r, queryValue(r, "tunnel"), queryValue(r, "rootId"), false)
	if !ok {
		return
	}
	preview, err := provider.Preview(root, queryValue(r, "path"), queryInt64(r, "offset"), previewMaxBytes)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_preview_failed", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, PreviewResponse{
		Path:       preview.Path,
		MIMEType:   preview.MIMEType,
		Content:    preview.Content,
		Truncated:  preview.Truncated,
		Offset:     preview.Offset,
		NextOffset: preview.NextOffset,
		Size:       preview.TotalSize,
	})
}

func (s *Server) createFolder(w http.ResponseWriter, r *http.Request) {
	var request CreateFolderRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}
	root, provider, ok := s.providerForRequest(w, r, request.Tunnel, request.RootID, true)
	if !ok {
		return
	}
	entry, err := provider.CreateFolder(root, request.ParentPath, request.Name)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, operationError(err))
		return
	}
	out := storageEntry(entry)
	writeJSON(w, http.StatusOK, OperationResponse{Success: true, Message: "Created folder " + entry.Name, Entry: &out})
}

func (s *Server) renameEntry(w http.ResponseWriter, r *http.Request) {
	var request RenameEntryRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}
	root, provider, ok := s.providerForRequest(w, r, request.Tunnel, request.RootID, true)
	if !ok {
		return
	}
	entry, err := provider.Rename(root, request.Path, request.NewName)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, operationError(err))
		return
	}
	out := storageEntry(entry)
	writeJSON(w, http.StatusOK, OperationResponse{Success: true, Message: "Renamed to " + entry.Name, Entry: &out})
}

func (s *Server) deleteEntry(w http.ResponseWriter, r *http.Request) {
	var request DeleteEntryRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}
	if !request.Confirmed {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "confirmation_required", Message: "Delete requires explicit confirmation"})
		return
	}
	root, provider, ok := s.providerForRequest(w, r, request.Tunnel, request.RootID, true)
	if !ok {
		return
	}
	if err := provider.Delete(root, request.Path); err != nil {
		writeAPIError(w, http.StatusBadRequest, operationError(err))
		return
	}
	writeJSON(w, http.StatusOK, OperationResponse{Success: true, Message: "Deleted " + request.Path, Entry: nil})
}

func (s *Server) copyEntry(w http.ResponseWriter, r *http.Request) {
	var request CopyEntryRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}
	root, provider, ok := s.providerForRequest(w, r, request.Tunnel, request.RootID, true)
	if !ok {
		return
	}
	entry, err := provider.Copy(root, request.SourcePath, request.TargetPath, request.Overwrite)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, operationError(err))
		return
	}
	out := storageEntry(entry)
	writeJSON(w, http.StatusOK, OperationResponse{Success: true, Message: "Copied to " + entry.Path, Entry: &out})
}

func (s *Server) moveEntry(w http.ResponseWriter, r *http.Request) {
	var request MoveEntryRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}
	root, provider, ok := s.providerForRequest(w, r, request.Tunnel, request.RootID, true)
	if !ok {
		return
	}
	entry, err := provider.Move(root, request.SourcePath, request.TargetPath, request.Overwrite)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, operationError(err))
		return
	}
	out := storageEntry(entry)
	writeJSON(w, http.StatusOK, OperationResponse{Success: true, Message: "Moved to " + entry.Path, Entry: &out})
}

func (s *Server) transferEntries(w http.ResponseWriter, r *http.Request) {
	var request TransferRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}
	response, apiErr := s.executeTransfer(requestIdentity(r), request)
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) startTransferJob(w http.ResponseWriter, r *http.Request) {
	var request TransferRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}
	response, apiErr := s.startTransferJobRequest(requestIdentity(r), request)
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) transferJobList(w http.ResponseWriter, r *http.Request) {
	response, apiErr := s.transferJobListRequest(requestIdentity(r))
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) transferJob(w http.ResponseWriter, r *http.Request) {
	response, apiErr := s.transferJobRequest(requestIdentity(r), r.PathValue("jobId"))
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) resolveTransferJob(w http.ResponseWriter, r *http.Request) {
	var request ResolveTransferJobRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}
	response, apiErr := s.resolveTransferJobRequest(requestIdentity(r), r.PathValue("jobId"), request)
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) cancelTransferJob(w http.ResponseWriter, r *http.Request) {
	response, apiErr := s.cancelTransferJobRequest(requestIdentity(r), r.PathValue("jobId"))
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) clearTransferJobs(w http.ResponseWriter, r *http.Request) {
	response, apiErr := s.clearTransferJobsRequest(requestIdentity(r))
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) sessionFor(resolved auth.ResolvedUser) SessionResponse {
	personal := s.access.PersonalRoots(resolved.Profile)
	global := s.access.GlobalRoots(resolved.Profile)
	return SessionResponse{
		User:            userProfile(resolved.Profile),
		AuthMode:        resolved.AuthMode,
		PersonalEnabled: len(personal) > 0,
		GlobalEnabled:   len(global) > 0,
	}
}

func (s *Server) navigationSection(label string, roots []storage.ResolvedStorageRoot) *NavigationSection {
	if len(roots) == 0 {
		return nil
	}
	section := &NavigationSection{Label: label, Roots: make([]NavigationRoot, 0, len(roots))}
	for _, root := range roots {
		capabilities, _ := s.registry.NavigationRoot(root)
		section.Roots = append(section.Roots, navigationRoot(root, capabilities))
	}
	return section
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeAuthFailure(w http.ResponseWriter, failure *auth.Failure) {
	writeAPIError(w, statusForError(failure.Code), APIError{Code: failure.Code, Message: failure.Message})
}

func writeAPIError(w http.ResponseWriter, status int, err APIError) {
	writeJSON(w, status, err)
}

func statusForError(code string) int {
	switch code {
	case "unauthorized", "authentication_failed", "authentication_disabled", "invalid_session", "session_expired", "invalid_token", "untrusted_issuer":
		return http.StatusUnauthorized
	default:
		return http.StatusBadRequest
	}
}

func decodeJSONBody(w http.ResponseWriter, r *http.Request, out any) bool {
	if err := json.NewDecoder(r.Body).Decode(out); err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "invalid_request", Message: "Request body is invalid"})
		return false
	}
	return true
}

func (s *Server) providerForRequest(w http.ResponseWriter, r *http.Request, tunnel string, rootID string, writable bool) (storage.ResolvedStorageRoot, storage.StorageProvider, bool) {
	root, ok := s.rootForRequest(w, r, tunnel, rootID, writable)
	if !ok {
		return storage.ResolvedStorageRoot{}, nil, false
	}
	provider, err := s.registry.Provider(root.ProviderID)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "unknown_provider", Message: err.Error()})
		return storage.ResolvedStorageRoot{}, nil, false
	}
	return root, provider, true
}

func (s *Server) rootForRequest(w http.ResponseWriter, r *http.Request, tunnel string, rootID string, writable bool) (storage.ResolvedStorageRoot, bool) {
	resolved, failure := s.resolver.Resolve(requestIdentity(r))
	if failure != nil {
		writeAuthFailure(w, failure)
		return storage.ResolvedStorageRoot{}, false
	}
	var roots []storage.ResolvedStorageRoot
	switch tunnel {
	case "personal":
		roots = s.access.PersonalRoots(resolved.Profile)
	case "global":
		roots = s.access.GlobalRoots(resolved.Profile)
	default:
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "unknown_tunnel", Message: fmt.Sprintf("Unknown storage tunnel '%s'", tunnel)})
		return storage.ResolvedStorageRoot{}, false
	}
	for _, root := range roots {
		if root.ID == rootID {
			if writable && root.ReadOnly {
				writeAPIError(w, http.StatusBadRequest, APIError{Code: "read_only_root", Message: "Storage root is read-only"})
				return storage.ResolvedStorageRoot{}, false
			}
			return root, true
		}
	}
	writeAPIError(w, http.StatusBadRequest, APIError{Code: "unknown_root", Message: fmt.Sprintf("Storage root '%s' is not available", rootID)})
	return storage.ResolvedStorageRoot{}, false
}

func queryValue(r *http.Request, key string) string {
	return r.URL.Query().Get(key)
}

func queryBool(r *http.Request, key string) bool {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	return value == "true" || value == "1" || value == "yes"
}

func queryInt64(r *http.Request, key string) int64 {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return 0
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < 0 {
		return 0
	}
	return parsed
}

func (s *Server) listOptionsForRequest(r *http.Request, root storage.ResolvedStorageRoot, path string) (storage.ListOptions, error) {
	pageSize := defaultEntryPageSize
	if value := strings.TrimSpace(queryValue(r, "pageSize")); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed <= 0 {
			return storage.ListOptions{}, fmt.Errorf("Page size must be a positive number")
		}
		pageSize = parsed
	}
	if pageSize > maxEntryPageSize {
		pageSize = maxEntryPageSize
	}
	query := strings.TrimSpace(queryValue(r, "query"))
	sortKey := strings.TrimSpace(queryValue(r, "sortKey"))
	if sortKey == "" {
		sortKey = storage.DefaultListSortKey
	}
	sortDirection := strings.TrimSpace(queryValue(r, "sortDirection"))
	if sortDirection == "" {
		sortDirection = storage.DefaultListSortDirection
	}
	options := storage.ListOptions{PageSize: pageSize, Query: query, SortKey: sortKey, SortDirection: sortDirection}
	if pageRef := strings.TrimSpace(queryValue(r, "pageRef")); pageRef != "" {
		ref, err := s.decodePageRef(pageRef)
		if err != nil {
			return storage.ListOptions{}, err
		}
		if err := ref.validate(root, path, query, sortKey, sortDirection, pageSize); err != nil {
			return storage.ListOptions{}, err
		}
		options.Cursor = ref.Cursor
	}
	return options, nil
}

func (s *Server) entryListPageMetadata(r *http.Request, root storage.ResolvedStorageRoot, path string, options storage.ListOptions, page storage.ListPage) (EntryListPage, error) {
	var nextRef *string
	if page.NextCursor != nil && *page.NextCursor != "" {
		value, err := s.encodePageRef(entryPageRef{
			Version:       1,
			Tunnel:        root.Tunnel,
			RootID:        root.ID,
			Path:          path,
			Query:         options.Query,
			SortKey:       options.SortKey,
			SortDirection: options.SortDirection,
			PageSize:      options.PageSize,
			Cursor:        page.NextCursor,
		})
		if err != nil {
			return EntryListPage{}, err
		}
		nextRef = &value
	}
	return EntryListPage{
		PageSize:      options.PageSize,
		NextPageRef:   nextRef,
		TotalCount:    page.TotalCount,
		FilteredCount: page.FilteredCount,
		HasMore:       nextRef != nil,
		Query:         options.Query,
		SortKey:       options.SortKey,
		SortDirection: options.SortDirection,
		Accuracy:      entryListAccuracy(page.Accuracy),
	}, nil
}

func entryListAccuracy(accuracy storage.ListAccuracy) EntryListAccuracy {
	return EntryListAccuracy{Search: accuracy.Search, Sort: accuracy.Sort, Total: accuracy.Total}
}

func operationError(err error) APIError {
	message := err.Error()
	lower := strings.ToLower(message)
	code := "storage_operation_failed"
	switch {
	case strings.Contains(lower, "already exists"):
		code = "target_conflict"
	case strings.Contains(lower, "escapes configured storage root"):
		code = "invalid_path"
	case strings.Contains(lower, "read-only"):
		code = "read_only_root"
	}
	return APIError{Code: code, Message: message}
}

func requestIdentity(r *http.Request) auth.RequestIdentity {
	return auth.RequestIdentity{
		ConfiguredUserHeader: r.Header.Get("X-Cagnard-User"),
		AuthorizationHeader:  r.Header.Get("Authorization"),
		Cookies:              parseCookies(r.Header.Values("Cookie")),
	}
}

func parseCookies(headers []string) map[string]string {
	out := map[string]string{}
	for _, header := range headers {
		for _, part := range strings.Split(header, ";") {
			key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
			if ok && key != "" {
				out[key] = value
			}
		}
	}
	return out
}

func authProviderMetadata(provider auth.ProviderMetadata) AuthProviderMetadata {
	fields := make([]AuthProviderField, 0, len(provider.Fields))
	for _, field := range provider.Fields {
		fields = append(fields, AuthProviderField{Name: field.Name, Label: field.Label, Kind: field.Kind, Required: field.Required})
	}
	return AuthProviderMetadata{
		ID:           provider.ID,
		Label:        provider.Label,
		Kind:         provider.Kind,
		LoginURL:     provider.LoginURL,
		Fields:       fields,
		Capabilities: append([]string{}, provider.Capabilities...),
	}
}

func navigationRoot(root storage.ResolvedStorageRoot, capabilities []storage.CapabilityStatus) NavigationRoot {
	return NavigationRoot{
		ID:             root.ID,
		Label:          root.Label,
		Tunnel:         root.Tunnel,
		ProviderID:     root.ProviderID,
		AccountID:      root.AccountID,
		ProviderFamily: root.ProviderFamily,
		ReadOnly:       root.ReadOnly,
		Capabilities:   capabilityStatuses(capabilities),
	}
}

func storageEntries(entries []storage.StorageEntry) []StorageEntry {
	out := make([]StorageEntry, 0, len(entries))
	for _, entry := range entries {
		out = append(out, storageEntry(entry))
	}
	return out
}

func storageEntry(entry storage.StorageEntry) StorageEntry {
	return StorageEntry{
		ID:               entry.ID,
		Name:             entry.Name,
		Path:             entry.Path,
		Kind:             entry.Kind,
		Metadata:         entryMetadata(entry.Metadata),
		Capabilities:     capabilityStatuses(entry.Capabilities),
		ProviderSpecific: copyStringMap(entry.ProviderSpecific),
	}
}

func entryMetadata(metadata storage.EntryMetadata) EntryMetadata {
	return EntryMetadata{
		Size:           metadata.Size,
		MIMEType:       metadata.MIMEType,
		Owner:          metadata.Owner,
		Permissions:    metadata.Permissions,
		ModifiedTime:   metadata.ModifiedTime,
		Version:        metadata.Version,
		Retention:      metadata.Retention,
		Encryption:     metadata.Encryption,
		Unavailable:    append([]string{}, metadata.Unavailable...),
		FileCategory:   metadata.FileCategory,
		FileIcon:       metadata.FileIcon,
		MIMETypeSource: metadata.MIMETypeSource,
	}
}

func capabilityStatuses(capabilities []storage.CapabilityStatus) []CapabilityStatus {
	out := make([]CapabilityStatus, 0, len(capabilities))
	for _, capability := range capabilities {
		out = append(out, CapabilityStatus{Name: capability.Name, Status: capability.Status, Description: capability.Description})
	}
	return out
}

func userProfile(profile auth.UserProfile) UserProfile {
	return UserProfile{
		ID:          profile.ID,
		DisplayName: profile.DisplayName,
		Roles:       append([]string{}, profile.Roles...),
		Groups:      append([]string{}, profile.Groups...),
		Claims:      copyStringMap(profile.Claims),
	}
}

func copyStringMap(values map[string]string) map[string]string {
	out := map[string]string{}
	for key, value := range values {
		out[key] = value
	}
	return out
}

func (s *Server) providerEnabled(providerID string) bool {
	for _, provider := range s.resolver.Providers() {
		if provider.ID == providerID {
			return true
		}
	}
	return false
}

func trimPtr(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func stringPtr(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func safeFileName(name string) string {
	out := strings.ReplaceAll(name, `"`, "")
	out = strings.ReplaceAll(out, "\r", "")
	out = strings.ReplaceAll(out, "\n", "")
	if out == "" {
		return "download"
	}
	return out
}
