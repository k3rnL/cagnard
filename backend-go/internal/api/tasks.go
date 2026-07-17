package api

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"path"
	"sort"
	"strconv"
	"strings"
	"sync"
)

const defaultTaskItemPageSize = 100
const maxTaskItemPageSize = 500

type taskManager struct {
	mu       sync.RWMutex
	jobs     map[string]storedTransferJob
	canceled map[string]bool
}

func validTaskStateTransition(current string, next string) bool {
	if current == next {
		return true
	}
	allowed := map[string]map[string]bool{
		"pending":   {"queued": true, "running": true, "blocked": true, "completed": true, "canceled": true, "error": true, "partial": true},
		"queued":    {"running": true, "blocked": true, "canceled": true, "error": true},
		"blocked":   {"pending": true, "canceled": true, "error": true},
		"running":   {"blocked": true, "completed": true, "canceled": true, "error": true, "failed": true, "partial": true},
		"canceling": {"canceled": true, "error": true, "partial": true},
	}
	return allowed[current][next]
}

func newTaskManager() *taskManager {
	return &taskManager{
		jobs:     map[string]storedTransferJob{},
		canceled: map[string]bool{},
	}
}

func (s *Server) taskContext(taskID string) context.Context {
	s.tasks.mu.RLock()
	defer s.tasks.mu.RUnlock()
	if stored, ok := s.tasks.jobs[taskID]; ok && stored.ctx != nil {
		return stored.ctx
	}
	return context.Background()
}

func (s *Server) taskList(w http.ResponseWriter, r *http.Request) {
	response, apiErr := s.transferJobListRequest(requestIdentity(r))
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	for index := range response.Jobs {
		response.Jobs[index] = taskSummary(response.Jobs[index])
	}
	writeJSON(w, http.StatusOK, TaskListResponse{Tasks: response.Jobs})
}

func (s *Server) taskDetail(w http.ResponseWriter, r *http.Request) {
	response, apiErr := s.transferJobRequest(requestIdentity(r), r.PathValue("taskId"))
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusOK, taskSummary(response))
}

func (s *Server) taskItems(w http.ResponseWriter, r *http.Request) {
	resolved, failure := s.resolver.Resolve(requestIdentity(r))
	if failure != nil {
		writeAuthFailure(w, failure)
		return
	}
	s.pruneTransferJobs(resolved.Profile.ID)
	s.tasks.mu.RLock()
	stored, ok := s.tasks.jobs[r.PathValue("taskId")]
	if !ok || stored.ownerID != resolved.Profile.ID {
		s.tasks.mu.RUnlock()
		writeAPIError(w, http.StatusNotFound, APIError{Code: "not_found", Message: "Task was not found"})
		return
	}
	items := orderTaskItems(cloneTaskItems(stored.items))
	s.tasks.mu.RUnlock()
	pageSize := defaultTaskItemPageSize
	if raw := strings.TrimSpace(r.URL.Query().Get("pageSize")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			writeAPIError(w, http.StatusBadRequest, APIError{Code: "invalid_page_size", Message: "Task item page size must be positive"})
			return
		}
		pageSize = min(parsed, maxTaskItemPageSize)
	}
	offset, err := decodeTaskPageRef(r.URL.Query().Get("pageRef"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "invalid_page_ref", Message: "Task item page reference is invalid"})
		return
	}
	if offset > len(items) {
		offset = len(items)
	}
	end := min(len(items), offset+pageSize)
	var next *string
	if end < len(items) {
		encoded := encodeTaskPageRef(end)
		next = &encoded
	}
	writeJSON(w, http.StatusOK, TaskItemPage{Items: items[offset:end], NextPageRef: next, TotalCount: len(items)})
}

func orderTaskItems(items []TaskItem) []TaskItem {
	children := make(map[string][]TaskItem)
	for _, item := range items {
		parentID := ""
		if item.ParentID != nil {
			parentID = *item.ParentID
		}
		children[parentID] = append(children[parentID], item)
	}
	for parentID := range children {
		sort.SliceStable(children[parentID], func(i, j int) bool {
			left, right := children[parentID][i], children[parentID][j]
			if rank := taskStateRank(left.Status) - taskStateRank(right.Status); rank != 0 {
				return rank < 0
			}
			return strings.ToLower(left.Name) < strings.ToLower(right.Name)
		})
	}

	ordered := make([]TaskItem, 0, len(items))
	visited := make(map[string]bool, len(items))
	var appendChildren func(string)
	appendChildren = func(parentID string) {
		for _, item := range children[parentID] {
			if visited[item.ID] {
				continue
			}
			visited[item.ID] = true
			ordered = append(ordered, item)
			appendChildren(item.ID)
		}
	}
	appendChildren("")
	for _, item := range items {
		if !visited[item.ID] {
			ordered = append(ordered, item)
		}
	}
	return ordered
}

func indexStoredTask(stored storedTransferJob) storedTransferJob {
	stored.job = cloneTaskResponse(stored.job)
	if stored.job.Operation == "upload" {
		stored.items = flattenUploadTaskItems(stored.job.Tasks)
	} else {
		stored.items = flattenTaskItems(stored.job.Tasks)
	}
	return stored
}

func flattenUploadTaskItems(tasks []TaskItem) []TaskItem {
	directoryIDs := make(map[string]string)
	for _, task := range tasks {
		if task.Kind == "directory" {
			directoryIDs[normalizeTaskPath(task.SourcePath)] = task.ID
		}
	}

	items := make([]TaskItem, 0, len(tasks))
	for _, task := range tasks {
		item := task
		item.Children = nil
		item.ParentID = nil
		item.Depth = 0
		if item.Name == "" {
			item.Name = taskItemName(item)
		}
		parentPath := path.Dir(normalizeTaskPath(item.SourcePath))
		for parentPath != "." && parentPath != "/" && parentPath != "" {
			if parentID, ok := directoryIDs[parentPath]; ok {
				item.ParentID = taskStringPtr(parentID)
				item.Depth = uploadTaskDepth(parentPath, directoryIDs)
				break
			}
			parentPath = path.Dir(parentPath)
		}
		items = append(items, item)
	}
	return items
}

func uploadTaskDepth(directoryPath string, directoryIDs map[string]string) int {
	depth := 1
	parentPath := path.Dir(directoryPath)
	for parentPath != "." && parentPath != "/" && parentPath != "" {
		if _, ok := directoryIDs[parentPath]; ok {
			depth++
		}
		parentPath = path.Dir(parentPath)
	}
	return depth
}

func taskSummary(job TaskResponse) TaskResponse {
	job.Tasks = []TaskItem{}
	job.Results = []TransferItemResult{}
	return job
}

func cloneTaskResponse(job TaskResponse) TaskResponse {
	if job.InitiatedFrom != nil {
		value := *job.InitiatedFrom
		job.InitiatedFrom = &value
	}
	if job.Download != nil {
		value := *job.Download
		job.Download = &value
	}
	job.Progress = cloneTaskProgress(job.Progress)
	job.Tasks = cloneTaskItems(job.Tasks)
	job.Results = cloneTransferResults(job.Results)
	return job
}

func cloneTaskItems(items []TaskItem) []TaskItem {
	if items == nil {
		return nil
	}
	cloned := make([]TaskItem, len(items))
	for index, item := range items {
		cloned[index] = item
		cloned[index].ParentID = cloneStringPointer(item.ParentID)
		cloned[index].TargetPath = cloneStringPointer(item.TargetPath)
		cloned[index].Progress = cloneTaskProgress(item.Progress)
		cloned[index].Result = cloneTransferResult(item.Result)
		cloned[index].Children = cloneTaskItems(item.Children)
	}
	return cloned
}

func cloneTaskProgress(progress TaskProgress) TaskProgress {
	progress.TotalBytes = cloneInt64Pointer(progress.TotalBytes)
	progress.TotalDelivered = cloneInt64Pointer(progress.TotalDelivered)
	progress.TotalItems = cloneIntPointer(progress.TotalItems)
	return progress
}

func cloneTransferResults(results []TransferItemResult) []TransferItemResult {
	if results == nil {
		return nil
	}
	cloned := make([]TransferItemResult, len(results))
	for index := range results {
		cloned[index] = *cloneTransferResult(&results[index])
	}
	return cloned
}

func cloneTransferResult(result *TransferItemResult) *TransferItemResult {
	if result == nil {
		return nil
	}
	cloned := *result
	cloned.TargetPath = cloneStringPointer(result.TargetPath)
	cloned.Entry = cloneStorageEntry(result.Entry)
	cloned.Children = cloneTransferResults(result.Children)
	return &cloned
}

func cloneStorageEntry(entry *StorageEntry) *StorageEntry {
	if entry == nil {
		return nil
	}
	cloned := *entry
	cloned.Metadata.Size = cloneInt64Pointer(entry.Metadata.Size)
	cloned.Metadata.MIMEType = cloneStringPointer(entry.Metadata.MIMEType)
	cloned.Metadata.Owner = cloneStringPointer(entry.Metadata.Owner)
	cloned.Metadata.Permissions = cloneStringPointer(entry.Metadata.Permissions)
	cloned.Metadata.ModifiedTime = cloneStringPointer(entry.Metadata.ModifiedTime)
	cloned.Metadata.Version = cloneStringPointer(entry.Metadata.Version)
	cloned.Metadata.Retention = cloneStringPointer(entry.Metadata.Retention)
	cloned.Metadata.Encryption = cloneStringPointer(entry.Metadata.Encryption)
	cloned.Metadata.FileCategory = cloneStringPointer(entry.Metadata.FileCategory)
	cloned.Metadata.FileIcon = cloneStringPointer(entry.Metadata.FileIcon)
	cloned.Metadata.MIMETypeSource = cloneStringPointer(entry.Metadata.MIMETypeSource)
	cloned.Metadata.Unavailable = append([]string(nil), entry.Metadata.Unavailable...)
	cloned.Capabilities = append([]CapabilityStatus(nil), entry.Capabilities...)
	for index := range cloned.Capabilities {
		cloned.Capabilities[index].Description = cloneStringPointer(cloned.Capabilities[index].Description)
	}
	if entry.ProviderSpecific != nil {
		cloned.ProviderSpecific = make(map[string]string, len(entry.ProviderSpecific))
		for key, value := range entry.ProviderSpecific {
			cloned.ProviderSpecific[key] = value
		}
	}
	return &cloned
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneInt64Pointer(value *int64) *int64 {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneIntPointer(value *int) *int {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func (s *Server) cancelTask(w http.ResponseWriter, r *http.Request) {
	response, apiErr := s.cancelTransferJobRequest(requestIdentity(r), r.PathValue("taskId"))
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) resolveTask(w http.ResponseWriter, r *http.Request) {
	var request ResolveTransferJobRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}
	identity := requestIdentity(r)
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		writeAuthFailure(w, failure)
		return
	}
	s.tasks.mu.RLock()
	stored, ok := s.tasks.jobs[r.PathValue("taskId")]
	s.tasks.mu.RUnlock()
	if !ok || stored.ownerID != resolved.Profile.ID {
		writeAPIError(w, http.StatusNotFound, APIError{Code: "not_found", Message: "Task was not found"})
		return
	}
	var response TaskResponse
	var apiErr *transferAPIError
	if stored.uploadRequest != nil {
		response, apiErr = s.resolveUploadTaskRequest(identity, r.PathValue("taskId"), request)
	} else {
		response, apiErr = s.resolveTransferJobRequest(identity, r.PathValue("taskId"), request)
	}
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) clearTasks(w http.ResponseWriter, r *http.Request) {
	response, apiErr := s.clearTransferJobsRequest(requestIdentity(r))
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func normalizedInitiatingLocation(requested *TaskLocation, destination TransferDestinationRequest) *TaskLocation {
	location := TaskLocation{Tunnel: destination.Tunnel, RootID: destination.RootID, Path: destination.Path}
	if requested != nil {
		location = *requested
	}
	location.Path = normalizeTaskPath(location.Path)
	return &location
}

func validateTaskLocation(location TaskLocation) (TaskLocation, *transferAPIError) {
	location.Tunnel = strings.TrimSpace(location.Tunnel)
	location.RootID = strings.TrimSpace(location.RootID)
	if location.Tunnel == "" || location.RootID == "" {
		return TaskLocation{}, badRequestAPIError("invalid_task_location", "Task location requires a tunnel and storage root")
	}
	cleaned, err := validateRelativeTaskPath(location.Path, true)
	if err != nil {
		return TaskLocation{}, badRequestAPIError("invalid_task_location", "Task location path is invalid")
	}
	location.Path = cleaned
	return location, nil
}

func validateRelativeTaskPath(value string, allowEmpty bool) (string, error) {
	raw := strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	if strings.HasPrefix(raw, "/") {
		return "", fmt.Errorf("absolute paths are not allowed")
	}
	for _, part := range strings.Split(raw, "/") {
		if part == ".." {
			return "", fmt.Errorf("parent traversal is not allowed")
		}
	}
	cleaned := normalizeTaskPath(raw)
	if cleaned == "" && !allowEmpty {
		return "", fmt.Errorf("path is required")
	}
	return cleaned, nil
}

func normalizeTaskPath(value string) string {
	cleaned := path.Clean("/" + strings.ReplaceAll(value, "\\", "/"))
	if cleaned == "/" || cleaned == "." {
		return ""
	}
	return strings.TrimPrefix(cleaned, "/")
}

func aggregateTaskProgress(tasks []TaskItem) TaskProgress {
	progress := TaskProgress{}
	var totalBytes int64
	bytesKnown := len(tasks) > 0
	var totalDelivered int64
	deliveryKnown := len(tasks) > 0
	var totalItems int
	itemsKnown := len(tasks) > 0
	for _, task := range tasks {
		progress.BytesTransferred += task.Progress.BytesTransferred
		progress.BytesDelivered += task.Progress.BytesDelivered
		progress.ItemsCompleted += task.Progress.ItemsCompleted
		if task.Progress.TotalBytes == nil {
			bytesKnown = false
		} else {
			totalBytes += *task.Progress.TotalBytes
		}
		if task.Progress.TotalDelivered == nil {
			deliveryKnown = false
		} else {
			totalDelivered += *task.Progress.TotalDelivered
		}
		if task.Progress.TotalItems == nil {
			itemsKnown = false
		} else {
			totalItems += *task.Progress.TotalItems
		}
	}
	if bytesKnown {
		progress.TotalBytes = int64TaskPtr(totalBytes)
	}
	if deliveryKnown {
		progress.TotalDelivered = int64TaskPtr(totalDelivered)
	}
	if itemsKnown {
		progress.TotalItems = intPtr(totalItems)
	}
	return progress
}

func flattenTaskItems(tasks []TaskItem) []TaskItem {
	items := make([]TaskItem, 0)
	var visit func([]TaskItem, *string, int)
	visit = func(children []TaskItem, parentID *string, depth int) {
		for _, child := range children {
			item := child
			item.ParentID = parentID
			item.Depth = depth
			item.Children = nil
			if item.Name == "" {
				item.Name = taskItemName(item)
			}
			items = append(items, item)
			id := child.ID
			visit(child.Children, &id, depth+1)
		}
	}
	visit(tasks, nil, 0)
	return items
}

func taskItemName(task TaskItem) string {
	value := task.SourcePath
	if task.TargetPath != nil && *task.TargetPath != "" {
		value = *task.TargetPath
	}
	if name := path.Base(strings.TrimSuffix(value, "/")); name != "." && name != "/" && name != "" {
		return name
	}
	return "Root"
}

func taskStateRank(status string) int {
	switch status {
	case "running":
		return 0
	case "pending", "queued", "blocked":
		return 1
	case "error", "failed", "partial":
		return 2
	case "canceled":
		return 3
	default:
		return 4
	}
}

func encodeTaskPageRef(offset int) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(offset)))
}

func decodeTaskPageRef(value string) (int, error) {
	if strings.TrimSpace(value) == "" {
		return 0, nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return 0, err
	}
	offset, err := strconv.Atoi(string(decoded))
	if err != nil || offset < 0 {
		return 0, fmt.Errorf("invalid task offset")
	}
	return offset, nil
}
