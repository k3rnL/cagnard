package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/auth"
	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

const defaultTransferMaxBytes int64 = 64 * 1024 * 1024
const transferTerminalRetention = time.Hour

type transferAPIError struct {
	Status int
	Error  APIError
}

type transferContext struct {
	root     storage.ResolvedStorageRoot
	provider storage.StorageProvider
	entry    storage.StorageEntry
}

type targetResolution struct {
	path      string
	overwrite bool
}

type storedTransferJob struct {
	ownerID         string
	job             TaskResponse
	items           []TaskItem
	request         TransferRequest
	ctx             context.Context
	cancel          context.CancelFunc
	deleteRequest   *DeleteTaskRequest
	downloadRequest *DownloadTaskRequest
	uploadRequest   *UploadTaskRequest
	itemSlots       chan struct{}
}

type transferJobContext struct {
	jobID     string
	taskIndex int
	taskID    string
}

type directoryChildTransfer struct {
	source     TransferSourceRequest
	entry      storage.StorageEntry
	targetPath string
	context    *transferJobContext
}

func (context *transferJobContext) effectiveTaskID() string {
	if context == nil {
		return ""
	}
	if context.taskID != "" {
		return context.taskID
	}
	return transferTaskID(context.taskIndex)
}

func (context *transferJobContext) child(taskID string) *transferJobContext {
	if context == nil {
		return nil
	}
	return &transferJobContext{jobID: context.jobID, taskIndex: context.taskIndex, taskID: taskID}
}

func (s *Server) executeTransfer(identity auth.RequestIdentity, request TransferRequest) (TransferResponse, *transferAPIError) {
	destinationRoot, destinationProvider, apiErr := s.destinationForTransfer(identity, request.Destination)
	if apiErr != nil {
		return TransferResponse{}, apiErr
	}
	policy := normalizeConflictPolicy(request.ConflictPolicy)
	preflight := []TransferItemResult{}
	if policy == "fail" {
		for _, source := range request.Sources {
			if result := s.preflightTransfer(identity, source, destinationRoot, destinationProvider, request.Destination.Path); result != nil {
				preflight = append(preflight, *result)
			}
		}
	}
	if len(preflight) > 0 {
		return TransferResponse{Success: false, Message: "Transfer needs a conflict decision", Results: preflight}, nil
	}
	results := make([]TransferItemResult, 0, len(request.Sources))
	for _, source := range request.Sources {
		results = append(results, s.transferOne(identity, source, destinationRoot, destinationProvider, request.Destination.Path, policy, nil))
	}
	return transferResponseFromResults(results), nil
}

func (s *Server) startTransferJobRequest(identity auth.RequestIdentity, request TransferRequest) (TaskResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return TaskResponse{}, authAPIError(failure)
	}
	destinationRoot, destinationProvider, apiErr := s.destinationForTransfer(identity, request.Destination)
	if apiErr != nil {
		return TaskResponse{}, apiErr
	}
	policy := normalizeConflictPolicy(request.ConflictPolicy)
	now := nowString()
	jobID := newJobID()
	tasks := make([]TaskItem, 0, len(request.Sources))
	for idx, source := range request.Sources {
		tasks = append(tasks, transferTask(idx, source, "pending", "pending", "Waiting to start", nil, nil))
	}
	preflight := []TransferItemResult{}
	if policy == "fail" {
		for _, source := range request.Sources {
			if result := s.preflightTransfer(identity, source, destinationRoot, destinationProvider, request.Destination.Path); result != nil {
				preflight = append(preflight, *result)
			}
		}
	}
	status := "pending"
	message := "Transfer task pending"
	if len(request.Sources) == 0 {
		status = "error"
		message = "No entries selected for transfer"
	} else if len(preflight) > 0 {
		status = "blocked"
		message = "Transfer needs a conflict decision"
		tasks = tasksFromResults(request.Sources, preflight)
	}
	job := TaskResponse{
		ID:             jobID,
		Status:         status,
		Message:        message,
		CreatedAt:      now,
		UpdatedAt:      now,
		Operation:      operationName(request.Sources),
		Revision:       1,
		InitiatedFrom:  normalizedInitiatingLocation(request.InitiatedFrom, request.Destination),
		Destination:    request.Destination,
		ConflictPolicy: policy,
		Tasks:          tasks,
		Results:        preflight,
	}
	job.Progress = aggregateTaskProgress(job.Tasks)
	s.tasks.mu.Lock()
	s.pruneTransferJobsLocked(resolved.Profile.ID, time.Now())
	request.ConflictPolicy = policy
	ctx, cancel := context.WithCancel(context.Background())
	s.tasks.jobs[jobID] = indexStoredTask(storedTransferJob{ownerID: resolved.Profile.ID, job: job, request: request, ctx: ctx, cancel: cancel})
	s.tasks.mu.Unlock()
	if len(preflight) == 0 && len(request.Sources) > 0 {
		go s.runTransferJob(jobID, identity, request, destinationRoot, destinationProvider, policy)
	}
	return job, nil
}

func (s *Server) transferJobRequest(identity auth.RequestIdentity, jobID string) (TaskResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return TaskResponse{}, authAPIError(failure)
	}
	s.pruneTransferJobs(resolved.Profile.ID)
	stored, ok := s.transferJobForOwner(jobID, resolved.Profile.ID)
	if !ok {
		return TaskResponse{}, notFoundAPIError("Task was not found")
	}
	return stored.job, nil
}

func (s *Server) transferJobListRequest(identity auth.RequestIdentity) (TransferJobListResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return TransferJobListResponse{}, authAPIError(failure)
	}
	s.pruneTransferJobs(resolved.Profile.ID)
	s.tasks.mu.RLock()
	jobs := make([]TaskResponse, 0)
	for _, stored := range s.tasks.jobs {
		if stored.ownerID == resolved.Profile.ID {
			jobs = append(jobs, cloneTaskResponse(stored.job))
		}
	}
	s.tasks.mu.RUnlock()
	sort.SliceStable(jobs, func(i, j int) bool { return jobs[i].CreatedAt > jobs[j].CreatedAt })
	return TransferJobListResponse{Jobs: jobs}, nil
}

func (s *Server) cancelTransferJobRequest(identity auth.RequestIdentity, jobID string) (TaskResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return TaskResponse{}, authAPIError(failure)
	}
	s.tasks.mu.Lock()
	defer s.tasks.mu.Unlock()
	stored, ok := s.tasks.jobs[jobID]
	if !ok || stored.ownerID != resolved.Profile.ID {
		return TaskResponse{}, notFoundAPIError("Task was not found")
	}
	if terminalJobStatus(stored.job.Status) {
		return stored.job, nil
	}
	s.tasks.canceled[jobID] = true
	if stored.cancel != nil {
		stored.cancel()
	}
	stored.job.Status = "canceled"
	stored.job.Message = taskCanceledMessage(stored.job.Operation, stored.job.MutationCount)
	stored.job.UpdatedAt = nowString()
	stored.job.Revision++
	for idx := range stored.job.Tasks {
		markTransferTaskCanceled(&stored.job.Tasks[idx])
	}
	stored.job.Progress = aggregateTaskProgress(stored.job.Tasks)
	s.tasks.jobs[jobID] = indexStoredTask(stored)
	return stored.job, nil
}

func (s *Server) resolveTransferJobRequest(identity auth.RequestIdentity, jobID string, resolve ResolveTransferJobRequest) (TaskResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return TaskResponse{}, authAPIError(failure)
	}
	policy := normalizeConflictPolicy(resolve.ConflictPolicy)
	if policy == "fail" {
		return TaskResponse{}, badRequestAPIError("invalid_conflict_policy", "Choose Skip, Keep both, or Replace to resolve the blocked transfer")
	}

	s.tasks.mu.RLock()
	stored, ok := s.tasks.jobs[jobID]
	if !ok || stored.ownerID != resolved.Profile.ID {
		s.tasks.mu.RUnlock()
		return TaskResponse{}, notFoundAPIError("Task was not found")
	}
	if stored.job.Status != "blocked" {
		s.tasks.mu.RUnlock()
		return TaskResponse{}, badRequestAPIError("task_not_blocked", "Transfer task is not waiting for a conflict decision")
	}
	request := stored.request
	s.tasks.mu.RUnlock()

	request.ConflictPolicy = policy
	destinationRoot, destinationProvider, apiErr := s.destinationForTransfer(identity, request.Destination)
	if apiErr != nil {
		return TaskResponse{}, apiErr
	}

	s.tasks.mu.Lock()
	stored, ok = s.tasks.jobs[jobID]
	if !ok || stored.ownerID != resolved.Profile.ID {
		s.tasks.mu.Unlock()
		return TaskResponse{}, notFoundAPIError("Task was not found")
	}
	if stored.job.Status != "blocked" {
		s.tasks.mu.Unlock()
		return TaskResponse{}, badRequestAPIError("task_not_blocked", "Transfer task is not waiting for a conflict decision")
	}
	delete(s.tasks.canceled, jobID)
	stored.request = request
	stored.job.Status = "pending"
	stored.job.Message = "Transfer conflict resolved"
	stored.job.UpdatedAt = nowString()
	stored.job.Revision++
	stored.job.ConflictPolicy = policy
	stored.job.Results = nil
	stored.job.Tasks = pendingTransferTasks(request.Sources)
	stored.job.Progress = aggregateTaskProgress(stored.job.Tasks)
	s.tasks.jobs[jobID] = indexStoredTask(stored)
	job := stored.job
	s.tasks.mu.Unlock()

	go s.runTransferJob(jobID, identity, request, destinationRoot, destinationProvider, policy)
	return job, nil
}

func (s *Server) clearTransferJobsRequest(identity auth.RequestIdentity) (OperationResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return OperationResponse{}, authAPIError(failure)
	}
	removed := 0
	s.tasks.mu.Lock()
	for id, stored := range s.tasks.jobs {
		if stored.ownerID == resolved.Profile.ID && terminalJobStatus(stored.job.Status) {
			if stored.cancel != nil {
				stored.cancel()
			}
			delete(s.tasks.jobs, id)
			delete(s.tasks.canceled, id)
			removed++
		}
	}
	s.tasks.mu.Unlock()
	return OperationResponse{Success: true, Message: fmt.Sprintf("Cleared %d task%s", removed, pluralSuffix(removed))}, nil
}

func (s *Server) runTransferJob(jobID string, identity auth.RequestIdentity, request TransferRequest, destinationRoot storage.ResolvedStorageRoot, destinationProvider storage.StorageProvider, conflictPolicy string) {
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		if job.Status == "canceled" {
			return job
		}
		job.Status = "running"
		job.Message = "Transfer task running"
		job.UpdatedAt = nowString()
		return job
	})
	results := make([]TransferItemResult, 0, len(request.Sources))
	for idx, source := range request.Sources {
		if s.isCanceled(jobID) {
			canceled := failedResult(source, nil, "Transfer job was canceled")
			canceled.Status = "canceled"
			s.updateJobTask(jobID, idx, "canceled", "canceled", "Canceled before start", &canceled)
			results = append(results, canceled)
			continue
		}
		s.updateJobTask(jobID, idx, "running", "running", "Transfer item running", nil)
		result := s.transferOne(identity, source, destinationRoot, destinationProvider, request.Destination.Path, conflictPolicy, &transferJobContext{jobID: jobID, taskIndex: idx, taskID: transferTaskID(idx)})
		phase := "error"
		status := taskStatusFromResult(result)
		if resultSucceeded(result) {
			phase = "completed"
		} else if result.Status == "canceled" {
			phase = "canceled"
		} else if hasConflict(result) {
			phase = "blocked"
			status = "blocked"
		}
		s.updateJobTask(jobID, idx, phase, status, result.Message, &result)
		results = append(results, result)
	}
	response := transferResponseFromResults(results)
	finalStatus := "error"
	if s.isCanceled(jobID) || anyStatus(results, "canceled") {
		finalStatus = "canceled"
		response.Message = "Transfer canceled"
	} else if response.Success {
		finalStatus = "completed"
	} else if anyConflict(results) {
		finalStatus = "blocked"
	}
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		if job.Status == "canceled" {
			return job
		}
		job.Status = finalStatus
		job.Message = response.Message
		job.UpdatedAt = nowString()
		job.Results = results
		job.MutationCount = mutationCountForResults(results)
		if finalStatus == "error" {
			log.Printf("transfer job %s failed: %s", jobID, response.Message)
		}
		return job
	})
}

func mutationCountForResults(results []TransferItemResult) int {
	count := 0
	for idx := range results {
		count += mutationCountForResult(&results[idx])
	}
	return count
}

func mutationCountForResult(result *TransferItemResult) int {
	if result == nil {
		return 0
	}
	count := 0
	switch result.Status {
	case "copied", "moved", "deleted", "uploaded":
		if len(result.Children) == 0 {
			count = 1
		}
	}
	for idx := range result.Children {
		count += mutationCountForResult(&result.Children[idx])
	}
	return count
}

func (s *Server) preflightTransfer(identity auth.RequestIdentity, source TransferSourceRequest, destinationRoot storage.ResolvedStorageRoot, destinationProvider storage.StorageProvider, destinationPath string) *TransferItemResult {
	intent, ok := normalizeIntent(source.Intent)
	if !ok {
		result := failedResult(source, nil, fmt.Sprintf("Unsupported transfer intent '%s'", source.Intent))
		return &result
	}
	source.Intent = intent
	context, apiErr := s.sourceContext(identity, source)
	if apiErr != nil {
		result := failedResult(source, nil, apiErr.Error.Message)
		return &result
	}
	targetPath := joinTransferPath(destinationPath, context.entry.Name)
	sameRoot := context.root.Tunnel == destinationRoot.Tunnel && context.root.ID == destinationRoot.ID
	if intent == "move" && context.root.ReadOnly {
		result := failedResult(source, nil, "Source root is read-only")
		return &result
	}
	if context.entry.Kind != "file" && context.entry.Kind != "directory" {
		result := failedResult(source, nil, fmt.Sprintf("Unsupported entry kind '%s'", context.entry.Kind))
		return &result
	}
	if sameRoot && targetPath == context.entry.Path && intent == "move" {
		result := failedResult(source, &targetPath, "Source and destination are the same entry")
		return &result
	}
	if sameRoot && context.entry.Kind == "directory" && targetPath != context.entry.Path && isDescendantPath(targetPath, context.entry.Path) {
		result := failedResult(source, &targetPath, "Cannot transfer a directory into itself")
		return &result
	}
	return s.preflightTarget(source, context.provider, context.root, context.entry, destinationProvider, destinationRoot, targetPath)
}

func (s *Server) preflightTarget(source TransferSourceRequest, sourceProvider storage.StorageProvider, sourceRoot storage.ResolvedStorageRoot, sourceEntry storage.StorageEntry, destinationProvider storage.StorageProvider, destinationRoot storage.ResolvedStorageRoot, targetPath string) *TransferItemResult {
	exists, err := destinationExists(destinationProvider, destinationRoot, targetPath)
	if err != nil {
		result := failedResult(source, &targetPath, err.Error())
		return &result
	}
	if exists {
		result := conflictResult(source, targetPath)
		return &result
	}
	if sourceEntry.Kind != "directory" {
		return nil
	}
	entries, err := sourceProvider.List(sourceRoot, sourceEntry.Path)
	if err != nil {
		result := failedResult(source, &targetPath, err.Error())
		return &result
	}
	for _, child := range entries {
		childSource := source
		childSource.Path = child.Path
		childResult := s.preflightTarget(childSource, sourceProvider, sourceRoot, child, destinationProvider, destinationRoot, joinTransferPath(targetPath, child.Name))
		if childResult != nil {
			parent := failedResult(source, &targetPath, "Directory contains conflicting destination item(s)")
			parent.Children = []TransferItemResult{*childResult}
			return &parent
		}
	}
	return nil
}

func (s *Server) transferOne(identity auth.RequestIdentity, source TransferSourceRequest, destinationRoot storage.ResolvedStorageRoot, destinationProvider storage.StorageProvider, destinationPath string, conflictPolicy string, jobContext *transferJobContext) TransferItemResult {
	intent, ok := normalizeIntent(source.Intent)
	if !ok {
		return failedResult(source, nil, fmt.Sprintf("Unsupported transfer intent '%s'", source.Intent))
	}
	source.Intent = intent
	if jobContext != nil && s.isCanceled(jobContext.jobID) {
		result := failedResult(source, nil, "Transfer job was canceled")
		result.Status = "canceled"
		return result
	}
	context, apiErr := s.sourceContext(identity, source)
	if apiErr != nil {
		return failedResult(source, nil, apiErr.Error.Message)
	}
	if intent == "move" && context.root.ReadOnly {
		return failedResult(source, nil, "Source root is read-only")
	}
	if context.entry.Kind != "file" && context.entry.Kind != "directory" {
		return failedResult(source, nil, fmt.Sprintf("Unsupported entry kind '%s'", context.entry.Kind))
	}
	targetPath := joinTransferPath(destinationPath, context.entry.Name)
	sameRoot := context.root.Tunnel == destinationRoot.Tunnel && context.root.ID == destinationRoot.ID
	if sameRoot && targetPath == context.entry.Path && (intent == "move" || conflictPolicy == "replace") {
		return failedResult(source, &targetPath, "Source and destination are the same entry")
	}
	if sameRoot && context.entry.Kind == "directory" && targetPath != context.entry.Path && isDescendantPath(targetPath, context.entry.Path) {
		return failedResult(source, &targetPath, "Cannot transfer a directory into itself")
	}
	if sameRoot && context.entry.Kind == "file" && (source.Intent != "copy" || jobContext == nil || !streamTransferSupported(context.provider, context.root, destinationProvider, destinationRoot)) {
		return s.transferSameRootFile(source, context, targetPath, conflictPolicy)
	}
	copied := s.copyTree(withIntent(source, "copy"), context.provider, context.root, context.entry, destinationProvider, destinationRoot, targetPath, conflictPolicy, jobContext)
	if intent == "copy" {
		copied.Intent = "copy"
		return copied
	}
	copied.Intent = "move"
	if !resultSucceeded(copied) {
		return copied
	}
	if jobContext != nil && s.isCanceled(jobContext.jobID) {
		copied.Status = "canceled"
		copied.Message = "Transfer job was canceled after destination copy; source was not deleted"
		return copied
	}
	if err := context.provider.Delete(context.root, context.entry.Path); err != nil {
		copied.Status = "partial"
		copied.Message = fmt.Sprintf("Copied to %s, but source delete failed: %s", stringValue(copied.TargetPath, targetPath), err.Error())
		return copied
	}
	copied.Status = "moved"
	copied.Message = fmt.Sprintf("Moved to %s", stringValue(copied.TargetPath, targetPath))
	return copied
}

func (s *Server) transferSameRootFile(source TransferSourceRequest, context transferContext, targetPath string, conflictPolicy string) TransferItemResult {
	target, conflict := s.resolveTarget(source, context.provider, context.root, targetPath, context.entry.Kind, conflictPolicy)
	if conflict != nil {
		return *conflict
	}
	var entry storage.StorageEntry
	var err error
	if source.Intent == "move" {
		entry, err = context.provider.Move(context.root, source.Path, target.path, target.overwrite)
	} else {
		entry, err = context.provider.Copy(context.root, source.Path, target.path, target.overwrite)
	}
	if err != nil {
		return failedResult(source, &target.path, err.Error())
	}
	out := storageEntry(entry)
	status := "copied"
	verb := "Copied"
	if source.Intent == "move" {
		status = "moved"
		verb = "Moved"
	}
	return TransferItemResult{Intent: source.Intent, SourceTunnel: source.Tunnel, SourceRootID: source.RootID, SourcePath: source.Path, TargetPath: &entry.Path, Status: status, Message: fmt.Sprintf("%s to %s", verb, entry.Path), Entry: &out}
}

func (s *Server) copyTree(source TransferSourceRequest, sourceProvider storage.StorageProvider, sourceRoot storage.ResolvedStorageRoot, sourceEntry storage.StorageEntry, destinationProvider storage.StorageProvider, destinationRoot storage.ResolvedStorageRoot, targetPath string, conflictPolicy string, jobContext *transferJobContext) TransferItemResult {
	target, conflict := s.resolveTarget(source, destinationProvider, destinationRoot, targetPath, sourceEntry.Kind, conflictPolicy)
	if conflict != nil {
		return *conflict
	}
	if jobContext != nil && s.isCanceled(jobContext.jobID) {
		result := failedResult(source, &target.path, "Transfer job was canceled")
		result.Status = "canceled"
		return result
	}
	if sourceEntry.Kind == "directory" {
		return s.copyDirectory(source, sourceProvider, sourceRoot, sourceEntry, destinationProvider, destinationRoot, target, conflictPolicy, jobContext)
	}
	return s.copyFile(source, sourceProvider, sourceRoot, destinationProvider, destinationRoot, target, jobContext)
}

func (s *Server) copyFile(source TransferSourceRequest, sourceProvider storage.StorageProvider, sourceRoot storage.ResolvedStorageRoot, destinationProvider storage.StorageProvider, destinationRoot storage.ResolvedStorageRoot, target targetResolution, jobContext *transferJobContext) TransferItemResult {
	var entry storage.StorageEntry
	var err error
	if streamTransferSupported(sourceProvider, sourceRoot, destinationProvider, destinationRoot) {
		entry, err = s.streamCopyFile(source, sourceProvider, sourceRoot, destinationProvider, destinationRoot, target, jobContext)
	} else {
		entry, err = s.bufferedCopyFile(source, sourceProvider, sourceRoot, destinationProvider, destinationRoot, target, jobContext)
	}
	if err != nil {
		status := "failed"
		if strings.Contains(strings.ToLower(err.Error()), "canceled") {
			status = "canceled"
		}
		result := failedResult(source, &target.path, err.Error())
		result.Status = status
		return result
	}
	out := storageEntry(entry)
	return TransferItemResult{Intent: source.Intent, SourceTunnel: source.Tunnel, SourceRootID: source.RootID, SourcePath: source.Path, TargetPath: &entry.Path, Status: "copied", Message: "Copied to " + entry.Path, Entry: &out}
}

func (s *Server) streamCopyFile(source TransferSourceRequest, sourceProvider storage.StorageProvider, sourceRoot storage.ResolvedStorageRoot, destinationProvider storage.StorageProvider, destinationRoot storage.ResolvedStorageRoot, target targetResolution, jobContext *transferJobContext) (storage.StorageEntry, error) {
	info, err := sourceProvider.ContentInfo(sourceRoot, source.Path)
	if err != nil {
		return storage.StorageEntry{}, err
	}
	reader, writer := io.Pipe()
	type readResult struct {
		info storage.FileContentInfo
		err  error
	}
	readDone := make(chan readResult, 1)
	ctx := context.Background()
	if jobContext != nil {
		ctx = s.taskContext(jobContext.jobID)
	}
	go func() {
		streamInfo, readErr := sourceProvider.StreamReadContext(ctx, sourceRoot, source.Path, writer, nil)
		if readErr != nil {
			_ = writer.CloseWithError(readErr)
		} else {
			_ = writer.Close()
		}
		readDone <- readResult{info: streamInfo, err: readErr}
	}()

	bytesTransferred := int64(0)
	canceled := false
	entry, writeErr := destinationProvider.StreamWriteContext(ctx, destinationRoot, target.path, reader, info, target.overwrite, func(delta int64) {
		bytesTransferred += delta
		if jobContext != nil {
			s.updateJobTaskProgress(jobContext.jobID, jobContext.effectiveTaskID(), bytesTransferred, info.Size, 0)
			if s.isCanceled(jobContext.jobID) {
				canceled = true
				_ = reader.CloseWithError(fmt.Errorf("Transfer job was canceled"))
			}
		}
	})
	if writeErr != nil {
		_ = reader.CloseWithError(writeErr)
	}
	read := <-readDone
	if canceled {
		return storage.StorageEntry{}, fmt.Errorf("Transfer job was canceled")
	}
	if writeErr != nil {
		return storage.StorageEntry{}, writeErr
	}
	if read.err != nil {
		return storage.StorageEntry{}, read.err
	}
	verifyInfo := info
	if verifyInfo.Size == nil {
		verifyInfo.Size = read.info.Size
	}
	if jobContext != nil {
		s.updateJobTaskProgress(jobContext.jobID, jobContext.effectiveTaskID(), bytesTransferred, verifyInfo.Size, 0)
	}
	if err := verifyWrittenEntry(verifyInfo, entry); err != nil {
		return storage.StorageEntry{}, err
	}
	return entry, nil
}

func (s *Server) bufferedCopyFile(source TransferSourceRequest, sourceProvider storage.StorageProvider, sourceRoot storage.ResolvedStorageRoot, destinationProvider storage.StorageProvider, destinationRoot storage.ResolvedStorageRoot, target targetResolution, jobContext *transferJobContext) (storage.StorageEntry, error) {
	info, err := sourceProvider.ContentInfo(sourceRoot, source.Path)
	if err != nil {
		return storage.StorageEntry{}, err
	}
	maxBytes := s.configuredTransferMaxBytes(sourceRoot, destinationRoot)
	if info.Size != nil && *info.Size > maxBytes {
		return storage.StorageEntry{}, fmt.Errorf("File exceeds buffered transfer limit of %d bytes and no streaming transfer path is available", maxBytes)
	}
	content, err := sourceProvider.Download(sourceRoot, source.Path)
	if err != nil {
		return storage.StorageEntry{}, err
	}
	actualSize := int64(len(content.Bytes))
	if actualSize > maxBytes {
		return storage.StorageEntry{}, fmt.Errorf("File exceeds buffered transfer limit of %d bytes and no streaming transfer path is available", maxBytes)
	}
	if jobContext != nil {
		s.updateJobTaskProgress(jobContext.jobID, jobContext.effectiveTaskID(), actualSize, &actualSize, 0)
	}
	if jobContext != nil && s.isCanceled(jobContext.jobID) {
		return storage.StorageEntry{}, fmt.Errorf("Transfer job was canceled")
	}
	entry, err := destinationProvider.Upload(destinationRoot, target.path, content.Bytes, target.overwrite)
	if err != nil {
		return storage.StorageEntry{}, err
	}
	if err := verifyWrittenEntry(storage.FileContentInfo{FileName: content.FileName, MIMEType: content.MIMEType, Size: &actualSize}, entry); err != nil {
		return storage.StorageEntry{}, err
	}
	return entry, nil
}

func (s *Server) copyDirectory(source TransferSourceRequest, sourceProvider storage.StorageProvider, sourceRoot storage.ResolvedStorageRoot, sourceEntry storage.StorageEntry, destinationProvider storage.StorageProvider, destinationRoot storage.ResolvedStorageRoot, target targetResolution, conflictPolicy string, jobContext *transferJobContext) TransferItemResult {
	entries, err := sourceProvider.List(sourceRoot, sourceEntry.Path)
	if err != nil {
		return failedResult(source, &target.path, err.Error())
	}
	directoryEntry, err := destinationProvider.CreateFolder(destinationRoot, parentTransferPath(target.path), fileTransferName(target.path))
	if err != nil {
		directoryEntry, err = destinationProvider.Stat(destinationRoot, target.path)
		if err != nil {
			return failedResult(source, &target.path, err.Error())
		}
	}
	children := make([]TransferItemResult, len(entries))
	plans := make([]directoryChildTransfer, 0, len(entries))
	parentTaskID := ""
	if jobContext != nil {
		parentTaskID = jobContext.effectiveTaskID()
	}
	for idx, child := range entries {
		childSource := source
		childSource.Path = child.Path
		childTargetPath := joinTransferPath(target.path, child.Name)
		var childContext *transferJobContext
		if jobContext != nil {
			childID := fmt.Sprintf("%s.%d", parentTaskID, idx+1)
			childContext = jobContext.child(childID)
			s.addJobTaskChild(jobContext.jobID, parentTaskID, taskFromStorageEntry(childID, childSource, child, childTargetPath))
		}
		plans = append(plans, directoryChildTransfer{source: childSource, entry: child, targetPath: childTargetPath, context: childContext})
	}
	copyChild := func(idx int) {
		plan := plans[idx]
		if plan.context != nil {
			s.updateJobTaskByID(plan.context.jobID, plan.context.effectiveTaskID(), "running", "running", "Transfer item running", nil)
		}
		result := s.copyTree(plan.source, sourceProvider, sourceRoot, plan.entry, destinationProvider, destinationRoot, plan.targetPath, conflictPolicy, plan.context)
		if plan.context != nil {
			phase := "error"
			status := taskStatusFromResult(result)
			if resultSucceeded(result) {
				phase = "completed"
			} else if result.Status == "canceled" {
				phase = "canceled"
			} else if hasConflict(result) {
				phase = "blocked"
				status = "blocked"
			}
			s.updateJobTaskByID(plan.context.jobID, plan.context.effectiveTaskID(), phase, status, result.Message, &result)
		}
		children[idx] = result
	}
	concurrency := min(s.transferConcurrency(), len(plans))
	if concurrency <= 1 {
		for idx := range plans {
			copyChild(idx)
		}
	} else {
		var wg sync.WaitGroup
		sem := make(chan struct{}, concurrency)
		for idx := range plans {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				copyChild(idx)
			}(idx)
		}
		wg.Wait()
	}
	ok := true
	for _, child := range children {
		if !resultSucceeded(child) {
			ok = false
			break
		}
	}
	out := storageEntry(directoryEntry)
	status := "copied"
	message := "Copied directory to " + directoryEntry.Path
	if !ok {
		status = "failed"
		message = fmt.Sprintf("Directory copy completed with %d failed child item(s)", countFailed(children))
	}
	return TransferItemResult{Intent: source.Intent, SourceTunnel: source.Tunnel, SourceRootID: source.RootID, SourcePath: source.Path, TargetPath: &directoryEntry.Path, Status: status, Message: message, Entry: &out, Children: children}
}

func (s *Server) resolveTarget(source TransferSourceRequest, provider storage.StorageProvider, root storage.ResolvedStorageRoot, targetPath string, sourceKind string, conflictPolicy string) (targetResolution, *TransferItemResult) {
	exists, err := destinationExists(provider, root, targetPath)
	if err != nil {
		result := failedResult(source, &targetPath, err.Error())
		return targetResolution{}, &result
	}
	if !exists {
		return targetResolution{path: targetPath, overwrite: false}, nil
	}
	switch conflictPolicy {
	case "skip":
		result := TransferItemResult{Intent: source.Intent, SourceTunnel: source.Tunnel, SourceRootID: source.RootID, SourcePath: source.Path, TargetPath: &targetPath, Status: "skipped", Message: "Skipped existing target " + targetPath}
		return targetResolution{}, &result
	case "keep-both":
		path, err := availablePath(provider, root, targetPath, sourceKind)
		if err != nil {
			result := failedResult(source, &targetPath, err.Error())
			return targetResolution{}, &result
		}
		return targetResolution{path: path, overwrite: false}, nil
	case "replace":
		if sourceKind == "directory" {
			if err := provider.Delete(root, targetPath); err != nil {
				result := failedResult(source, &targetPath, "Cannot replace existing directory: "+err.Error())
				return targetResolution{}, &result
			}
			return targetResolution{path: targetPath, overwrite: false}, nil
		}
		return targetResolution{path: targetPath, overwrite: true}, nil
	default:
		result := conflictResult(source, targetPath)
		return targetResolution{}, &result
	}
}

func (s *Server) sourceContext(identity auth.RequestIdentity, source TransferSourceRequest) (transferContext, *transferAPIError) {
	root, apiErr := s.rootForIdentity(identity, source.Tunnel, source.RootID, false)
	if apiErr != nil {
		return transferContext{}, apiErr
	}
	provider, err := s.registry.Provider(root.ProviderID)
	if err != nil {
		return transferContext{}, badRequestAPIError("unknown_provider", err.Error())
	}
	entry, err := provider.Stat(root, source.Path)
	if err != nil {
		op := operationError(err)
		return transferContext{}, badRequestAPIError(op.Code, op.Message)
	}
	return transferContext{root: root, provider: provider, entry: entry}, nil
}

func (s *Server) destinationForTransfer(identity auth.RequestIdentity, destination TransferDestinationRequest) (storage.ResolvedStorageRoot, storage.StorageProvider, *transferAPIError) {
	root, apiErr := s.rootForIdentity(identity, destination.Tunnel, destination.RootID, true)
	if apiErr != nil {
		return storage.ResolvedStorageRoot{}, nil, apiErr
	}
	provider, err := s.registry.Provider(root.ProviderID)
	if err != nil {
		return storage.ResolvedStorageRoot{}, nil, badRequestAPIError("unknown_provider", err.Error())
	}
	return root, provider, nil
}

func (s *Server) rootForIdentity(identity auth.RequestIdentity, tunnel string, rootID string, writable bool) (storage.ResolvedStorageRoot, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return storage.ResolvedStorageRoot{}, authAPIError(failure)
	}
	var roots []storage.ResolvedStorageRoot
	switch tunnel {
	case "personal":
		roots = s.access.PersonalRoots(resolved.Profile)
	case "global":
		roots = s.access.GlobalRoots(resolved.Profile)
	default:
		return storage.ResolvedStorageRoot{}, badRequestAPIError("unknown_tunnel", fmt.Sprintf("Unknown storage tunnel '%s'", tunnel))
	}
	for _, root := range roots {
		if root.ID == rootID {
			if writable && root.ReadOnly {
				return storage.ResolvedStorageRoot{}, badRequestAPIError("read_only_root", "Storage root is read-only")
			}
			return root, nil
		}
	}
	return storage.ResolvedStorageRoot{}, badRequestAPIError("unknown_root", fmt.Sprintf("Storage root '%s' is not available", rootID))
}

func destinationExists(provider storage.StorageProvider, root storage.ResolvedStorageRoot, path string) (bool, error) {
	_, err := provider.Stat(root, path)
	if err == nil {
		return true, nil
	}
	if strings.Contains(strings.ToLower(err.Error()), "does not exist") {
		return false, nil
	}
	return false, err
}

func streamTransferSupported(sourceProvider storage.StorageProvider, sourceRoot storage.ResolvedStorageRoot, destinationProvider storage.StorageProvider, destinationRoot storage.ResolvedStorageRoot) bool {
	return capabilitySupported(sourceProvider, sourceRoot, "stream-read") && capabilitySupported(destinationProvider, destinationRoot, "stream-write")
}

func capabilitySupported(provider storage.StorageProvider, root storage.ResolvedStorageRoot, name string) bool {
	for _, capability := range provider.Capabilities(root) {
		if capability.Name == name && capability.Status == "supported" {
			return true
		}
	}
	return false
}

func availablePath(provider storage.StorageProvider, root storage.ResolvedStorageRoot, targetPath string, sourceKind string) (string, error) {
	for attempt := 1; attempt <= 100; attempt++ {
		name := fileTransferName(targetPath)
		parent := parentTransferPath(targetPath)
		nextName := ""
		if sourceKind == "file" {
			nextName = copyName(name, attempt)
		} else if attempt == 1 {
			nextName = name + " copy"
		} else {
			nextName = fmt.Sprintf("%s copy %d", name, attempt)
		}
		path := joinTransferPath(parent, nextName)
		exists, err := destinationExists(provider, root, path)
		if err != nil {
			return "", err
		}
		if !exists {
			return path, nil
		}
	}
	return "", fmt.Errorf("Could not find a non-conflicting target name")
}

func (s *Server) configuredTransferMaxBytes(sourceRoot storage.ResolvedStorageRoot, destinationRoot storage.ResolvedStorageRoot) int64 {
	best := int64(0)
	for _, root := range []storage.ResolvedStorageRoot{sourceRoot, destinationRoot} {
		if value, ok := root.Settings["maxBufferedObjectBytes"]; ok {
			if parsed, err := parsePositiveInt64(value); err == nil {
				if best == 0 || parsed < best {
					best = parsed
				}
			}
		}
		for _, provider := range s.cfg.Providers {
			if provider.ID == root.ProviderID {
				if value, ok := provider.Settings["maxBufferedObjectBytes"]; ok {
					if parsed, err := parsePositiveInt64(value); err == nil {
						if best == 0 || parsed < best {
							best = parsed
						}
					}
				}
			}
		}
	}
	if best > 0 {
		return best
	}
	return defaultTransferMaxBytes
}

func verifyWrittenEntry(info storage.FileContentInfo, entry storage.StorageEntry) error {
	if info.Size != nil && entry.Metadata.Size != nil && *info.Size != *entry.Metadata.Size {
		return fmt.Errorf("Destination size verification failed: expected %d bytes, found %d bytes", *info.Size, *entry.Metadata.Size)
	}
	return nil
}

func transferResponseFromResults(results []TransferItemResult) TransferResponse {
	success := len(results) > 0
	for _, result := range results {
		if !resultSucceeded(result) {
			success = false
			break
		}
	}
	completed := countSucceeded(results)
	message := "No entries selected for transfer"
	if len(results) > 0 && success {
		message = pluralTransferMessage("Transferred", completed)
	} else if anyConflict(results) {
		message = "Transfer needs a conflict decision"
	} else if len(results) > 0 {
		message = fmt.Sprintf("Transferred %d of %d item%s", completed, len(results), pluralSuffix(len(results)))
	}
	return TransferResponse{Success: success, Message: message, Results: results}
}

func resultSucceeded(result TransferItemResult) bool {
	if result.Status != "copied" && result.Status != "moved" && result.Status != "skipped" {
		return false
	}
	for _, child := range result.Children {
		if !resultSucceeded(child) {
			return false
		}
	}
	return true
}

func hasConflict(result TransferItemResult) bool {
	if result.Status == "conflict" {
		return true
	}
	for _, child := range result.Children {
		if hasConflict(child) {
			return true
		}
	}
	return false
}

func conflictResult(source TransferSourceRequest, targetPath string) TransferItemResult {
	return TransferItemResult{Intent: source.Intent, SourceTunnel: source.Tunnel, SourceRootID: source.RootID, SourcePath: source.Path, TargetPath: &targetPath, Status: "conflict", Message: "Target already exists: " + targetPath}
}

func failedResult(source TransferSourceRequest, targetPath *string, message string) TransferItemResult {
	return TransferItemResult{Intent: source.Intent, SourceTunnel: source.Tunnel, SourceRootID: source.RootID, SourcePath: source.Path, TargetPath: targetPath, Status: "failed", Message: message}
}

func normalizeIntent(intent string) (string, bool) {
	value := strings.ToLower(strings.TrimSpace(intent))
	return value, value == "copy" || value == "move"
}

func normalizeConflictPolicy(policy string) string {
	value := strings.ToLower(strings.TrimSpace(policy))
	switch value {
	case "fail", "skip", "keep-both", "replace":
		return value
	default:
		return "fail"
	}
}

func isDescendantPath(path string, ancestor string) bool {
	cleanPath := strings.Trim(strings.TrimPrefix(path, "/"), "/")
	cleanAncestor := strings.Trim(strings.TrimPrefix(ancestor, "/"), "/")
	return cleanAncestor != "" && strings.HasPrefix(cleanPath, cleanAncestor+"/")
}

func parentTransferPath(path string) string {
	parts := pathParts(path)
	if len(parts) <= 1 {
		return ""
	}
	return strings.Join(parts[:len(parts)-1], "/")
}

func fileTransferName(path string) string {
	parts := pathParts(path)
	if len(parts) == 0 {
		return ""
	}
	return parts[len(parts)-1]
}

func joinTransferPath(parent string, name string) string {
	cleanParent := strings.Trim(strings.TrimPrefix(parent, "/"), "/")
	cleanName := strings.TrimPrefix(name, "/")
	if cleanParent == "" {
		return cleanName
	}
	if cleanName == "" {
		return cleanParent
	}
	return cleanParent + "/" + cleanName
}

func copyName(name string, attempt int) string {
	suffix := "copy"
	if attempt > 1 {
		suffix = fmt.Sprintf("copy %d", attempt)
	}
	dot := strings.LastIndex(name, ".")
	if dot > 0 && dot < len(name)-1 {
		return name[:dot] + " " + suffix + name[dot:]
	}
	return name + " " + suffix
}

func pathParts(path string) []string {
	raw := strings.Split(strings.Trim(path, "/"), "/")
	out := make([]string, 0, len(raw))
	for _, part := range raw {
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func parsePositiveInt64(value string) (int64, error) {
	var out int64
	_, err := fmt.Sscan(strings.TrimSpace(value), &out)
	if err != nil || out <= 0 {
		return 0, fmt.Errorf("invalid positive integer")
	}
	return out, nil
}

func withIntent(source TransferSourceRequest, intent string) TransferSourceRequest {
	source.Intent = intent
	return source
}

func operationName(sources []TransferSourceRequest) string {
	seen := map[string]bool{}
	for _, source := range sources {
		if intent, ok := normalizeIntent(source.Intent); ok {
			seen[intent] = true
		} else if source.Intent != "" {
			seen[source.Intent] = true
		}
	}
	if len(seen) == 1 {
		for value := range seen {
			return value
		}
	}
	if len(seen) == 0 {
		return "transfer"
	}
	return "mixed"
}

func transferTask(index int, source TransferSourceRequest, phase string, status string, message string, targetPath *string, result *TransferItemResult) TaskItem {
	progress := TaskProgress{TotalItems: intPtr(1)}
	if result != nil {
		progress = progressFromTransferResult(*result, progress)
	}
	id := transferTaskID(index)
	return TaskItem{ID: id, Intent: source.Intent, SourceTunnel: source.Tunnel, SourceRootID: source.RootID, SourcePath: source.Path, TargetPath: targetPath, Phase: phase, Status: status, Message: message, Progress: progress, Result: result, Children: resultToTaskChildren(id, result)}
}

func transferTaskID(index int) string {
	return fmt.Sprintf("task-%d", index+1)
}

func taskFromStorageEntry(id string, source TransferSourceRequest, entry storage.StorageEntry, targetPath string) TaskItem {
	progress := TaskProgress{TotalItems: intPtr(1)}
	if entry.Kind == "file" && entry.Metadata.Size != nil {
		progress.TotalBytes = entry.Metadata.Size
	}
	return TaskItem{
		ID:           id,
		Intent:       source.Intent,
		SourceTunnel: source.Tunnel,
		SourceRootID: source.RootID,
		SourcePath:   entry.Path,
		TargetPath:   taskStringPtr(targetPath),
		Phase:        "pending",
		Status:       "pending",
		Message:      "Waiting to start",
		Progress:     progress,
	}
}

func pendingTransferTasks(sources []TransferSourceRequest) []TaskItem {
	tasks := make([]TaskItem, 0, len(sources))
	for idx, source := range sources {
		tasks = append(tasks, transferTask(idx, source, "pending", "pending", "Waiting to start", nil, nil))
	}
	return tasks
}

func tasksFromResults(sources []TransferSourceRequest, results []TransferItemResult) []TaskItem {
	tasks := make([]TaskItem, 0, len(sources))
	for idx, source := range sources {
		var result *TransferItemResult
		for resultIdx := range results {
			if results[resultIdx].SourceTunnel == source.Tunnel && results[resultIdx].SourceRootID == source.RootID && results[resultIdx].SourcePath == source.Path {
				result = &results[resultIdx]
				break
			}
		}
		if result == nil {
			tasks = append(tasks, transferTask(idx, source, "pending", "pending", "Waiting to start", nil, nil))
			continue
		}
		status := taskStatusFromResult(*result)
		if hasConflict(*result) {
			status = "blocked"
		}
		tasks = append(tasks, transferTask(idx, source, status, status, result.Message, result.TargetPath, result))
	}
	return tasks
}

func resultToTaskChildren(parentID string, result *TransferItemResult) []TaskItem {
	if result == nil {
		return nil
	}
	children := make([]TaskItem, 0, len(result.Children))
	for idx := range result.Children {
		child := result.Children[idx]
		id := fmt.Sprintf("%s.%d", parentID, idx+1)
		progress := progressFromTransferResult(child, TaskProgress{TotalItems: intPtr(1)})
		status := taskStatusFromResult(child)
		children = append(children, TaskItem{ID: id, Intent: child.Intent, SourceTunnel: child.SourceTunnel, SourceRootID: child.SourceRootID, SourcePath: child.SourcePath, TargetPath: child.TargetPath, Phase: status, Status: status, Message: child.Message, Progress: progress, Result: &child, Children: resultToTaskChildren(id, &child)})
	}
	return children
}

func progressFromTransferResult(result TransferItemResult, existing TaskProgress) TaskProgress {
	progress := existing
	if progress.TotalItems == nil {
		progress.TotalItems = intPtr(1)
	}
	if result.Entry != nil && result.Entry.Metadata.Size != nil {
		progress.TotalBytes = result.Entry.Metadata.Size
	}
	if resultSucceeded(result) {
		if progress.TotalItems != nil {
			progress.ItemsCompleted = *progress.TotalItems
		} else {
			progress.ItemsCompleted = 1
		}
		if progress.TotalBytes != nil {
			progress.BytesTransferred = *progress.TotalBytes
		}
	}
	return progress
}

func taskStatusFromResult(result TransferItemResult) string {
	if resultSucceeded(result) {
		return "completed"
	}
	if hasConflict(result) {
		return "blocked"
	}
	switch result.Status {
	case "canceled":
		return "canceled"
	case "running":
		return "running"
	case "pending":
		return "pending"
	default:
		return "error"
	}
}

func (s *Server) transferJobForOwner(jobID string, ownerID string) (storedTransferJob, bool) {
	s.tasks.mu.RLock()
	defer s.tasks.mu.RUnlock()
	stored, ok := s.tasks.jobs[jobID]
	stored.job = cloneTaskResponse(stored.job)
	stored.items = cloneTaskItems(stored.items)
	return stored, ok && stored.ownerID == ownerID
}

func (s *Server) updateJob(jobID string, update func(TaskResponse) TaskResponse) {
	s.tasks.mu.Lock()
	defer s.tasks.mu.Unlock()
	stored, ok := s.tasks.jobs[jobID]
	if !ok {
		return
	}
	previous := cloneTaskResponse(stored.job)
	stored.job = update(cloneTaskResponse(stored.job))
	if !validTaskStateTransition(previous.Status, stored.job.Status) {
		log.Printf("task %s rejected invalid state transition %s -> %s", jobID, previous.Status, stored.job.Status)
		stored.job.Status = previous.Status
		stored.job.Message = previous.Message
	}
	stored.job.Revision++
	stored.job.Progress = aggregateTaskProgress(stored.job.Tasks)
	s.tasks.jobs[jobID] = indexStoredTask(stored)
}

func (s *Server) updateJobTask(jobID string, index int, phase string, status string, message string, result *TransferItemResult) {
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		if index >= 0 && index < len(job.Tasks) {
			task := job.Tasks[index]
			previousMutations := mutationCountForResult(task.Result)
			task.Phase = phase
			task.Status = status
			task.Message = message
			if result != nil {
				task.TargetPath = result.TargetPath
				task.Result = result
				task.Progress = progressFromTransferResult(*result, task.Progress)
				task.Children = resultToTaskChildren(task.ID, result)
			}
			job.MutationCount += mutationCountForResult(task.Result) - previousMutations
			job.Tasks[index] = task
		}
		recomputeTaskProgress(job.Tasks)
		job.UpdatedAt = nowString()
		return job
	})
}

func (s *Server) addJobTaskChild(jobID string, parentID string, child TaskItem) {
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		job.Tasks, _ = addTaskChild(job.Tasks, parentID, child)
		job.UpdatedAt = nowString()
		return job
	})
}

func (s *Server) updateJobTaskByID(jobID string, taskID string, phase string, status string, message string, result *TransferItemResult) {
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		job.Tasks, _ = updateTaskByID(job.Tasks, taskID, func(task TaskItem) TaskItem {
			task.Phase = phase
			task.Status = status
			task.Message = message
			if result != nil {
				task.TargetPath = result.TargetPath
				task.Result = result
				task.Progress = progressFromTransferResult(*result, task.Progress)
				task.Children = mergeTransferTaskChildren(task.Children, resultToTaskChildren(task.ID, result))
			}
			return task
		})
		recomputeTaskProgress(job.Tasks)
		job.UpdatedAt = nowString()
		return job
	})
}

func (s *Server) updateJobTaskProgress(jobID string, taskID string, bytesTransferred int64, totalBytes *int64, itemsCompleted int) {
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		job.Tasks, _ = updateTaskByID(job.Tasks, taskID, func(task TaskItem) TaskItem {
			if task.Phase == "planned" || task.Phase == "queued" || task.Phase == "pending" {
				task.Phase = "running"
			}
			if task.Status == "queued" || task.Status == "pending" {
				task.Status = "running"
			}
			task.Progress.BytesTransferred = bytesTransferred
			if totalBytes != nil {
				task.Progress.TotalBytes = totalBytes
			}
			task.Progress.ItemsCompleted = itemsCompleted
			return task
		})
		recomputeTaskProgress(job.Tasks)
		job.UpdatedAt = nowString()
		return job
	})
}

func addTaskChild(tasks []TaskItem, parentID string, child TaskItem) ([]TaskItem, bool) {
	for idx := range tasks {
		if tasks[idx].ID == parentID {
			for _, existing := range tasks[idx].Children {
				if existing.ID == child.ID {
					return tasks, true
				}
			}
			tasks[idx].Children = append(tasks[idx].Children, child)
			recomputeTaskProgress(tasks)
			return tasks, true
		}
		if updated, ok := addTaskChild(tasks[idx].Children, parentID, child); ok {
			tasks[idx].Children = updated
			recomputeTaskProgress(tasks)
			return tasks, true
		}
	}
	return tasks, false
}

func updateTaskByID(tasks []TaskItem, taskID string, update func(TaskItem) TaskItem) ([]TaskItem, bool) {
	for idx := range tasks {
		if tasks[idx].ID == taskID {
			tasks[idx] = update(tasks[idx])
			return tasks, true
		}
		if updated, ok := updateTaskByID(tasks[idx].Children, taskID, update); ok {
			tasks[idx].Children = updated
			return tasks, true
		}
	}
	return tasks, false
}

func mergeTransferTaskChildren(existing []TaskItem, incoming []TaskItem) []TaskItem {
	if len(existing) == 0 {
		return incoming
	}
	merged := make([]TaskItem, 0, len(existing)+len(incoming))
	seen := map[string]bool{}
	for _, child := range existing {
		merged = append(merged, child)
		seen[child.ID] = true
	}
	for _, child := range incoming {
		if seen[child.ID] {
			continue
		}
		merged = append(merged, child)
	}
	return merged
}

func recomputeTaskProgress(tasks []TaskItem) {
	for idx := range tasks {
		recomputeTaskProgress(tasks[idx].Children)
		if len(tasks[idx].Children) == 0 {
			continue
		}
		var bytesTransferred int64
		var totalBytes int64
		totalBytesKnown := false
		itemsCompleted := 0
		totalItems := 0
		totalItemsKnown := false
		for _, child := range tasks[idx].Children {
			bytesTransferred += child.Progress.BytesTransferred
			if child.Progress.TotalBytes != nil {
				totalBytes += *child.Progress.TotalBytes
				totalBytesKnown = true
			}
			itemsCompleted += child.Progress.ItemsCompleted
			if child.Progress.TotalItems != nil {
				totalItems += *child.Progress.TotalItems
				totalItemsKnown = true
			}
		}
		tasks[idx].Progress.BytesTransferred = bytesTransferred
		if totalBytesKnown {
			tasks[idx].Progress.TotalBytes = int64TaskPtr(totalBytes)
		}
		tasks[idx].Progress.ItemsCompleted = itemsCompleted
		if totalItemsKnown {
			tasks[idx].Progress.TotalItems = intPtr(totalItems)
		}
	}
}

func markTransferTaskCanceled(task *TaskItem) {
	if !terminalTaskStatus(task.Status) {
		task.Status = "canceled"
		task.Phase = "canceled"
		task.Message = "Canceled"
	}
	for idx := range task.Children {
		markTransferTaskCanceled(&task.Children[idx])
	}
}

func (s *Server) isCanceled(jobID string) bool {
	s.tasks.mu.RLock()
	defer s.tasks.mu.RUnlock()
	if s.tasks.canceled[jobID] {
		return true
	}
	stored, ok := s.tasks.jobs[jobID]
	if !ok || stored.ctx == nil {
		return false
	}
	select {
	case <-stored.ctx.Done():
		return true
	default:
		return false
	}
}

func (s *Server) transferConcurrency() int {
	if s.cfg == nil || s.cfg.Tasks.MaxConcurrentItems <= 0 {
		return 4
	}
	return s.cfg.Tasks.MaxConcurrentItems
}

func terminalJobStatus(status string) bool {
	switch status {
	case "completed", "canceled", "error", "failed", "partial":
		return true
	default:
		return false
	}
}

func terminalTaskStatus(status string) bool {
	switch status {
	case "completed", "canceled", "error", "failed", "partial", "skipped":
		return true
	default:
		return false
	}
}

func (s *Server) pruneTransferJobs(ownerID string) {
	s.tasks.mu.Lock()
	defer s.tasks.mu.Unlock()
	s.pruneTransferJobsLocked(ownerID, time.Now())
}

func (s *Server) pruneTransferJobsLocked(ownerID string, now time.Time) {
	for id, stored := range s.tasks.jobs {
		if stored.ownerID != ownerID || !autoPrunableTransferStatus(stored.job.Status) {
			continue
		}
		updated, err := time.Parse(time.RFC3339Nano, stored.job.UpdatedAt)
		if err != nil {
			continue
		}
		if now.Sub(updated) >= transferTerminalRetention {
			if stored.cancel != nil {
				stored.cancel()
			}
			delete(s.tasks.jobs, id)
			delete(s.tasks.canceled, id)
		}
	}
}

func autoPrunableTransferStatus(status string) bool {
	return terminalJobStatus(status)
}

func taskCanceledMessage(operation string, mutationCount int) string {
	switch operation {
	case "delete":
		return fmt.Sprintf("Delete canceled after removing %d item%s; completed deletions cannot be restored", mutationCount, pluralSuffix(mutationCount))
	case "download":
		return "Download canceled"
	case "upload":
		return "Upload canceled"
	default:
		return "Transfer canceled"
	}
}

func nowString() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func newJobID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(bytes)
}

func authAPIError(failure *auth.Failure) *transferAPIError {
	return &transferAPIError{Status: statusForError(failure.Code), Error: APIError{Code: failure.Code, Message: failure.Message}}
}

func badRequestAPIError(code string, message string) *transferAPIError {
	return &transferAPIError{Status: http.StatusBadRequest, Error: APIError{Code: code, Message: message}}
}

func notFoundAPIError(message string) *transferAPIError {
	return &transferAPIError{Status: http.StatusNotFound, Error: APIError{Code: "not_found", Message: message}}
}

func countSucceeded(results []TransferItemResult) int {
	count := 0
	for _, result := range results {
		if resultSucceeded(result) {
			count++
		}
	}
	return count
}

func countFailed(results []TransferItemResult) int {
	count := 0
	for _, result := range results {
		if !resultSucceeded(result) {
			count++
		}
	}
	return count
}

func anyConflict(results []TransferItemResult) bool {
	for _, result := range results {
		if hasConflict(result) {
			return true
		}
	}
	return false
}

func anyStatus(results []TransferItemResult, status string) bool {
	for _, result := range results {
		if result.Status == status {
			return true
		}
	}
	return false
}

func pluralTransferMessage(prefix string, count int) string {
	return fmt.Sprintf("%s %d item%s", prefix, count, pluralSuffix(count))
}

func pluralSuffix(count int) string {
	if count == 1 {
		return ""
	}
	return "s"
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func intPtr(value int) *int {
	return &value
}

func int64TaskPtr(value int64) *int64 {
	return &value
}

func taskStringPtr(value string) *string {
	return &value
}

func stringValue(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	return *value
}
