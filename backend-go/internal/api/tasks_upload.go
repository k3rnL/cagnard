package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/auth"
	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

const maxUploadManifestItems = 10000

func (s *Server) startUploadTask(w http.ResponseWriter, r *http.Request) {
	var request UploadTaskRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}
	job, apiErr := s.startUploadTaskRequest(requestIdentity(r), request)
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusCreated, job)
}

func (s *Server) startUploadTaskRequest(identity auth.RequestIdentity, request UploadTaskRequest) (TaskResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return TaskResponse{}, authAPIError(failure)
	}
	if len(request.Items) == 0 {
		return TaskResponse{}, badRequestAPIError("empty_upload", "Select at least one file or directory to upload")
	}
	if len(request.Items) > maxUploadManifestItems {
		return TaskResponse{}, badRequestAPIError("upload_manifest_too_large", fmt.Sprintf("Upload manifests support at most %d items", maxUploadManifestItems))
	}
	destination, apiErr := validateTaskLocation(request.Destination)
	if apiErr != nil {
		return TaskResponse{}, apiErr
	}
	initiatedFrom, apiErr := validateTaskLocation(request.InitiatedFrom)
	if apiErr != nil {
		return TaskResponse{}, apiErr
	}
	root, provider, apiErr := s.taskLocationProvider(identity, destination, true)
	if apiErr != nil {
		return TaskResponse{}, apiErr
	}
	if _, rootErr := s.rootForIdentity(identity, initiatedFrom.Tunnel, initiatedFrom.RootID, false); rootErr != nil {
		return TaskResponse{}, rootErr
	}
	policy := normalizeConflictPolicy(request.ConflictPolicy)

	seen := map[string]bool{}
	tasks := make([]TaskItem, 0, len(request.Items))
	validated := make([]UploadManifestItem, 0, len(request.Items))
	conflicts := 0
	for index, item := range request.Items {
		relative, err := validateRelativeTaskPath(item.RelativePath, false)
		if err != nil {
			return TaskResponse{}, badRequestAPIError("invalid_upload_path", fmt.Sprintf("Upload item %d has an invalid relative path", index+1))
		}
		kind := strings.ToLower(strings.TrimSpace(item.Kind))
		if kind != "file" && kind != "directory" {
			return TaskResponse{}, badRequestAPIError("invalid_upload_kind", fmt.Sprintf("Upload item %d must be a file or directory", index+1))
		}
		if item.Size != nil && *item.Size < 0 {
			return TaskResponse{}, badRequestAPIError("invalid_upload_size", fmt.Sprintf("Upload item %d has an invalid size", index+1))
		}
		key := strings.ToLower(relative)
		if seen[key] {
			return TaskResponse{}, badRequestAPIError("duplicate_upload_path", "Upload manifest paths must be unique")
		}
		seen[key] = true
		item.RelativePath = relative
		item.Kind = kind
		if item.MIMEType != nil {
			value := strings.TrimSpace(*item.MIMEType)
			if value == "" {
				item.MIMEType = nil
			} else {
				item.MIMEType = &value
			}
		}
		target := joinTransferPath(destination.Path, relative)
		task := taskForUploadItem(index, destination, item, target)
		exists, existsErr := destinationExists(provider, root, target)
		if existsErr != nil {
			return TaskResponse{}, badRequestAPIError("storage_stat_failed", "Upload destination could not be checked")
		}
		if exists {
			existing, statErr := provider.Stat(root, target)
			mergeDirectory := statErr == nil && kind == "directory" && existing.Kind == "directory"
			if !mergeDirectory {
				switch policy {
				case "fail":
					task.Status = "blocked"
					task.Phase = "blocked"
					task.Message = "An item already exists at the destination"
					conflicts++
				case "skip":
					task.Status = "skipped"
					task.Phase = "completed"
					task.Message = "Skipped existing item"
					task.Progress.ItemsCompleted = 1
				case "keep-both":
					target, err = availablePath(provider, root, target, kind)
					if err != nil {
						return TaskResponse{}, badRequestAPIError("storage_conflict_failed", "A non-conflicting upload name could not be selected")
					}
					task.TargetPath = &target
				}
			}
		}
		validated = append(validated, item)
		tasks = append(tasks, task)
	}
	request.Destination = destination
	request.InitiatedFrom = initiatedFrom
	request.ConflictPolicy = policy
	request.Items = validated

	status, message := "pending", "Waiting for browser upload"
	if conflicts > 0 {
		status, message = "blocked", "Upload needs a conflict decision"
	}
	allSkipped := true
	for _, task := range tasks {
		if task.Status != "skipped" {
			allSkipped = false
			break
		}
	}
	if allSkipped {
		status, message = "completed", "All existing items were skipped"
	}
	now := nowString()
	jobID := newJobID()
	job := TaskResponse{
		ID: jobID, Status: status, Message: message, CreatedAt: now, UpdatedAt: now,
		Operation: "upload", Revision: 1, InitiatedFrom: &initiatedFrom,
		Destination:    TransferDestinationRequest{Tunnel: destination.Tunnel, RootID: destination.RootID, Path: destination.Path},
		ConflictPolicy: policy, Tasks: tasks,
	}
	job.Progress = aggregateTaskProgress(job.Tasks)
	ctx, cancel := context.WithCancel(context.Background())
	s.tasks.mu.Lock()
	s.pruneTransferJobsLocked(resolved.Profile.ID, time.Now())
	s.tasks.jobs[jobID] = indexStoredTask(storedTransferJob{
		ownerID: resolved.Profile.ID, job: job, ctx: ctx, cancel: cancel, uploadRequest: &request,
		itemSlots: make(chan struct{}, s.transferConcurrency()),
	})
	s.tasks.mu.Unlock()
	return job, nil
}

func taskForUploadItem(index int, destination TaskLocation, item UploadManifestItem, target string) TaskItem {
	totalItems := 1
	return TaskItem{
		ID: transferTaskID(index), Name: path.Base(item.RelativePath), Kind: item.Kind, Intent: "upload",
		SourceTunnel: "browser", SourceRootID: destination.RootID, SourcePath: item.RelativePath,
		TargetPath: taskStringPtr(target), Phase: "pending", Status: "pending", Message: "Waiting for browser",
		Progress: TaskProgress{TotalBytes: item.Size, TotalItems: &totalItems},
	}
}

func (s *Server) uploadTaskItem(w http.ResponseWriter, r *http.Request) {
	identity := requestIdentity(r)
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		writeAuthFailure(w, failure)
		return
	}
	jobID := r.PathValue("taskId")
	itemID := r.PathValue("itemId")

	s.tasks.mu.RLock()
	stored, ok := s.tasks.jobs[jobID]
	if !ok || stored.ownerID != resolved.Profile.ID || stored.uploadRequest == nil || stored.job.Operation != "upload" {
		s.tasks.mu.RUnlock()
		writeAPIError(w, http.StatusNotFound, APIError{Code: "not_found", Message: "Upload task was not found"})
		return
	}
	request := *stored.uploadRequest
	item, task, found := uploadItemForID(request, stored.job, itemID)
	slots := stored.itemSlots
	ctx := stored.ctx
	s.tasks.mu.RUnlock()
	if !found {
		writeAPIError(w, http.StatusNotFound, APIError{Code: "not_found", Message: "Upload item was not found"})
		return
	}
	if slots == nil {
		slots = make(chan struct{}, s.transferConcurrency())
	}
	select {
	case slots <- struct{}{}:
		defer func() { <-slots }()
	case <-ctx.Done():
		writeAPIError(w, http.StatusConflict, APIError{Code: "task_canceled", Message: "Upload task was canceled"})
		return
	case <-r.Context().Done():
		return
	}

	s.tasks.mu.Lock()
	stored, ok = s.tasks.jobs[jobID]
	if !ok || stored.ownerID != resolved.Profile.ID || stored.job.Status == "blocked" || terminalJobStatus(stored.job.Status) {
		s.tasks.mu.Unlock()
		writeAPIError(w, http.StatusConflict, APIError{Code: "upload_unavailable", Message: "This upload item is no longer available"})
		return
	}
	current, found := findTaskItem(stored.job.Tasks, itemID)
	if !found || current.Status != "pending" {
		s.tasks.mu.Unlock()
		writeAPIError(w, http.StatusConflict, APIError{Code: "upload_item_already_delivered", Message: "This upload item has already been delivered"})
		return
	}
	stored.job.Status = "running"
	stored.job.Message = "Uploading"
	stored.job.UpdatedAt = nowString()
	stored.job.Revision++
	stored.job.Tasks, _ = updateTaskByID(stored.job.Tasks, itemID, func(value TaskItem) TaskItem {
		value.Status, value.Phase, value.Message = "running", "running", "Uploading"
		return value
	})
	s.tasks.jobs[jobID] = indexStoredTask(stored)
	s.tasks.mu.Unlock()

	requestCtx, cancel := mergeRequestContext(ctx, r.Context())
	defer cancel()
	root, provider, apiErr := s.taskLocationProvider(identity, request.Destination, true)
	if apiErr != nil {
		s.failUploadItem(jobID, itemID, "Upload destination is unavailable", fmt.Errorf("%s", apiErr.Error.Message), false)
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	target := ""
	if task.TargetPath != nil {
		target = *task.TargetPath
	}
	if target == "" {
		s.failUploadItem(jobID, itemID, "Upload destination is invalid", fmt.Errorf("missing target path"), false)
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "invalid_upload_target", Message: "Upload destination is invalid"})
		return
	}

	var entry storage.StorageEntry
	var uploadErr error
	if item.Kind == "directory" {
		entry, uploadErr = ensureUploadDirectory(requestCtx, provider, root, target)
	} else {
		reporter := newTaskByteReporter(s, jobID, itemID, item.Size, false)
		entry, uploadErr = provider.StreamWriteContext(requestCtx, root, target, r.Body, storage.FileContentInfo{
			FileName: path.Base(target), MIMEType: item.MIMEType, Size: item.Size,
		}, request.ConflictPolicy == "replace", reporter.Add)
		reporter.Finish()
	}
	if uploadErr != nil {
		disconnected := r.Context().Err() != nil
		s.failUploadItem(jobID, itemID, "Item could not be uploaded", uploadErr, disconnected)
		if !disconnected {
			writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_upload_failed", Message: "Item could not be uploaded"})
		}
		return
	}
	s.completeUploadItem(jobID, itemID)
	writeJSON(w, http.StatusOK, UploadItemResponse{TaskID: jobID, ItemID: itemID, Status: "completed", Message: "Uploaded " + entry.Name})
}

func uploadItemForID(request UploadTaskRequest, job TaskResponse, itemID string) (UploadManifestItem, TaskItem, bool) {
	for index, item := range request.Items {
		if transferTaskID(index) == itemID && index < len(job.Tasks) {
			return item, job.Tasks[index], true
		}
	}
	return UploadManifestItem{}, TaskItem{}, false
}

func findTaskItem(tasks []TaskItem, itemID string) (TaskItem, bool) {
	for _, task := range tasks {
		if task.ID == itemID {
			return task, true
		}
		if child, ok := findTaskItem(task.Children, itemID); ok {
			return child, true
		}
	}
	return TaskItem{}, false
}

func ensureUploadDirectory(ctx context.Context, provider storage.StorageProvider, root storage.ResolvedStorageRoot, target string) (storage.StorageEntry, error) {
	parts := strings.Split(strings.Trim(target, "/"), "/")
	parent := ""
	var entry storage.StorageEntry
	for _, name := range parts {
		if err := ctx.Err(); err != nil {
			return storage.StorageEntry{}, err
		}
		current := joinTransferPath(parent, name)
		exists, err := destinationExists(provider, root, current)
		if err != nil {
			return storage.StorageEntry{}, err
		}
		if exists {
			entry, err = provider.Stat(root, current)
			if err != nil {
				return storage.StorageEntry{}, err
			}
			if entry.Kind != "directory" {
				return storage.StorageEntry{}, fmt.Errorf("Target already exists and is not a directory")
			}
		} else {
			entry, err = provider.CreateFolder(root, parent, name)
			if err != nil {
				return storage.StorageEntry{}, err
			}
		}
		parent = current
	}
	return entry, nil
}

func (s *Server) completeUploadItem(jobID string, itemID string) {
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		wasCompleted := false
		job.Tasks, _ = updateTaskByID(job.Tasks, itemID, func(task TaskItem) TaskItem {
			wasCompleted = task.Status == "completed"
			task.Status, task.Phase, task.Message = "completed", "completed", "Uploaded"
			if task.Progress.TotalBytes != nil {
				task.Progress.BytesTransferred = *task.Progress.TotalBytes
			}
			task.Progress.ItemsCompleted = 1
			return task
		})
		if !wasCompleted {
			job.MutationCount++
		}
		finalizeUploadJob(&job)
		job.UpdatedAt = nowString()
		return job
	})
}

func (s *Server) failUploadItem(jobID string, itemID string, message string, err error, disconnected bool) {
	log.Printf("upload task %s item %s failed: %v", jobID, itemID, err)
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		job.Tasks, _ = updateTaskByID(job.Tasks, itemID, func(task TaskItem) TaskItem {
			task.Status, task.Phase, task.Message = "error", "error", message
			return task
		})
		if disconnected {
			for index := range job.Tasks {
				if job.Tasks[index].Status == "pending" {
					job.Tasks[index].Status, job.Tasks[index].Phase, job.Tasks[index].Message = "canceled", "canceled", "Browser upload stopped"
				}
			}
		}
		finalizeUploadJob(&job)
		job.UpdatedAt = nowString()
		return job
	})
}

func finalizeUploadJob(job *TaskResponse) {
	pending, succeeded, failed := 0, 0, 0
	for _, task := range job.Tasks {
		switch task.Status {
		case "pending", "running", "queued", "blocked":
			pending++
		case "completed", "skipped":
			succeeded++
		default:
			failed++
		}
	}
	if pending > 0 {
		if job.Status != "blocked" && job.Status != "pending" {
			job.Status, job.Message = "running", "Uploading"
		}
		return
	}
	switch {
	case failed > 0 && succeeded > 0:
		job.Status, job.Message = "partial", "Upload completed with some failed items"
	case failed > 0:
		job.Status, job.Message = "error", "Upload failed"
	default:
		job.Status, job.Message = "completed", fmt.Sprintf("Uploaded %d item%s", job.MutationCount, pluralSuffix(job.MutationCount))
	}
}

func (s *Server) taskLocationProvider(identity auth.RequestIdentity, location TaskLocation, writable bool) (storage.ResolvedStorageRoot, storage.StorageProvider, *transferAPIError) {
	return s.taskSourceProvider(identity, TaskSourceRequest{Tunnel: location.Tunnel, RootID: location.RootID, Path: location.Path}, writable)
}

func (s *Server) resolveUploadTaskRequest(identity auth.RequestIdentity, jobID string, resolve ResolveTransferJobRequest) (TaskResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return TaskResponse{}, authAPIError(failure)
	}
	policy := normalizeConflictPolicy(resolve.ConflictPolicy)
	if policy == "fail" {
		return TaskResponse{}, badRequestAPIError("invalid_conflict_policy", "Choose Skip, Keep both, or Replace to resolve the blocked upload")
	}
	s.tasks.mu.RLock()
	stored, ok := s.tasks.jobs[jobID]
	if !ok || stored.ownerID != resolved.Profile.ID || stored.uploadRequest == nil {
		s.tasks.mu.RUnlock()
		return TaskResponse{}, notFoundAPIError("Task was not found")
	}
	if stored.job.Status != "blocked" {
		s.tasks.mu.RUnlock()
		return TaskResponse{}, badRequestAPIError("task_not_blocked", "Upload task is not waiting for a conflict decision")
	}
	request := *stored.uploadRequest
	s.tasks.mu.RUnlock()
	root, provider, apiErr := s.taskLocationProvider(identity, request.Destination, true)
	if apiErr != nil {
		return TaskResponse{}, apiErr
	}

	s.tasks.mu.Lock()
	defer s.tasks.mu.Unlock()
	stored, ok = s.tasks.jobs[jobID]
	if !ok || stored.ownerID != resolved.Profile.ID || stored.job.Status != "blocked" {
		return TaskResponse{}, badRequestAPIError("task_not_blocked", "Upload task is not waiting for a conflict decision")
	}
	for index := range stored.job.Tasks {
		task := stored.job.Tasks[index]
		if task.Status != "blocked" || task.TargetPath == nil {
			continue
		}
		switch policy {
		case "skip":
			task.Status, task.Phase, task.Message = "skipped", "completed", "Skipped existing item"
			task.Progress.ItemsCompleted = 1
		case "keep-both":
			kind := request.Items[index].Kind
			target, err := availablePath(provider, root, *task.TargetPath, kind)
			if err != nil {
				return TaskResponse{}, badRequestAPIError("storage_conflict_failed", "A non-conflicting upload name could not be selected")
			}
			task.TargetPath = &target
			task.Status, task.Phase, task.Message = "pending", "pending", "Waiting for browser"
		case "replace":
			task.Status, task.Phase, task.Message = "pending", "pending", "Waiting for browser"
		}
		stored.job.Tasks[index] = task
	}
	request.ConflictPolicy = policy
	stored.uploadRequest = &request
	stored.job.ConflictPolicy = policy
	stored.job.Status, stored.job.Message = "pending", "Waiting for browser upload"
	stored.job.UpdatedAt = nowString()
	stored.job.Revision++
	finalizeUploadJob(&stored.job)
	stored.job.Progress = aggregateTaskProgress(stored.job.Tasks)
	s.tasks.jobs[jobID] = indexStoredTask(stored)
	return stored.job, nil
}
