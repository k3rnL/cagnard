package api

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/auth"
	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

const defaultTransferMaxBytes int64 = 64 * 1024 * 1024

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
	ownerID string
	job     TransferJobResponse
}

type transferJobContext struct {
	jobID     string
	taskIndex int
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

func (s *Server) startTransferJobRequest(identity auth.RequestIdentity, request TransferRequest) (TransferJobResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return TransferJobResponse{}, authAPIError(failure)
	}
	destinationRoot, destinationProvider, apiErr := s.destinationForTransfer(identity, request.Destination)
	if apiErr != nil {
		return TransferJobResponse{}, apiErr
	}
	policy := normalizeConflictPolicy(request.ConflictPolicy)
	now := nowString()
	jobID := newJobID()
	tasks := make([]TransferJobTask, 0, len(request.Sources))
	for idx, source := range request.Sources {
		tasks = append(tasks, transferTask(idx, source, "planned", "queued", "Waiting to start", nil, nil))
	}
	preflight := []TransferItemResult{}
	if policy == "fail" {
		for _, source := range request.Sources {
			if result := s.preflightTransfer(identity, source, destinationRoot, destinationProvider, request.Destination.Path); result != nil {
				preflight = append(preflight, *result)
			}
		}
	}
	status := "queued"
	message := "Transfer job queued"
	if len(request.Sources) == 0 {
		status = "failed"
		message = "No entries selected for transfer"
	} else if len(preflight) > 0 {
		status = "blocked"
		message = "Transfer needs a conflict decision"
		tasks = tasksFromResults(request.Sources, preflight)
	}
	job := TransferJobResponse{
		ID:             jobID,
		Status:         status,
		Message:        message,
		CreatedAt:      now,
		UpdatedAt:      now,
		Operation:      operationName(request.Sources),
		Destination:    request.Destination,
		ConflictPolicy: policy,
		Tasks:          tasks,
		Results:        preflight,
	}
	s.transferMu.Lock()
	s.transferJobs[jobID] = storedTransferJob{ownerID: resolved.Profile.ID, job: job}
	s.transferMu.Unlock()
	if len(preflight) == 0 && len(request.Sources) > 0 {
		go s.runTransferJob(jobID, identity, request, destinationRoot, destinationProvider, policy)
	}
	return job, nil
}

func (s *Server) transferJobRequest(identity auth.RequestIdentity, jobID string) (TransferJobResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return TransferJobResponse{}, authAPIError(failure)
	}
	stored, ok := s.transferJobForOwner(jobID, resolved.Profile.ID)
	if !ok {
		return TransferJobResponse{}, notFoundAPIError("Transfer job was not found")
	}
	return stored.job, nil
}

func (s *Server) transferJobListRequest(identity auth.RequestIdentity) (TransferJobListResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return TransferJobListResponse{}, authAPIError(failure)
	}
	s.transferMu.RLock()
	jobs := make([]TransferJobResponse, 0)
	for _, stored := range s.transferJobs {
		if stored.ownerID == resolved.Profile.ID {
			jobs = append(jobs, stored.job)
		}
	}
	s.transferMu.RUnlock()
	sort.SliceStable(jobs, func(i, j int) bool { return jobs[i].CreatedAt > jobs[j].CreatedAt })
	return TransferJobListResponse{Jobs: jobs}, nil
}

func (s *Server) cancelTransferJobRequest(identity auth.RequestIdentity, jobID string) (TransferJobResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return TransferJobResponse{}, authAPIError(failure)
	}
	s.transferMu.Lock()
	defer s.transferMu.Unlock()
	stored, ok := s.transferJobs[jobID]
	if !ok || stored.ownerID != resolved.Profile.ID {
		return TransferJobResponse{}, notFoundAPIError("Transfer job was not found")
	}
	s.canceledTransferJobs[jobID] = true
	if !terminalJobStatus(stored.job.Status) {
		stored.job.Status = "canceling"
		stored.job.Message = "Cancellation requested"
		stored.job.UpdatedAt = nowString()
		s.transferJobs[jobID] = stored
	}
	return stored.job, nil
}

func (s *Server) runTransferJob(jobID string, identity auth.RequestIdentity, request TransferRequest, destinationRoot storage.ResolvedStorageRoot, destinationProvider storage.StorageProvider, conflictPolicy string) {
	s.updateJob(jobID, func(job TransferJobResponse) TransferJobResponse {
		job.Status = "running"
		job.Message = "Transfer job running"
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
		s.updateJobTask(jobID, idx, "running", "running", "Transfer task running", nil)
		result := s.transferOne(identity, source, destinationRoot, destinationProvider, request.Destination.Path, conflictPolicy, &transferJobContext{jobID: jobID, taskIndex: idx})
		phase := "failed"
		status := result.Status
		if resultSucceeded(result) {
			phase = "completed"
		} else if result.Status == "canceled" {
			phase = "canceled"
		} else if result.Status == "partial" {
			phase = "partial"
		} else if hasConflict(result) {
			phase = "blocked"
			status = "blocked"
		}
		s.updateJobTask(jobID, idx, phase, status, result.Message, &result)
		results = append(results, result)
	}
	response := transferResponseFromResults(results)
	finalStatus := "failed"
	if s.isCanceled(jobID) || anyStatus(results, "canceled") {
		finalStatus = "canceled"
		response.Message = "Transfer job canceled"
	} else if response.Success {
		finalStatus = "completed"
	} else if anyConflict(results) {
		finalStatus = "blocked"
	} else if countSucceeded(results) > 0 {
		finalStatus = "partial"
	}
	s.updateJob(jobID, func(job TransferJobResponse) TransferJobResponse {
		job.Status = finalStatus
		job.Message = response.Message
		job.UpdatedAt = nowString()
		job.Results = results
		return job
	})
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
	if sameRoot && context.entry.Kind == "file" {
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
	go func() {
		streamInfo, readErr := sourceProvider.StreamRead(sourceRoot, source.Path, writer, nil)
		if readErr != nil {
			_ = writer.CloseWithError(readErr)
		} else {
			_ = writer.Close()
		}
		readDone <- readResult{info: streamInfo, err: readErr}
	}()

	bytesTransferred := int64(0)
	canceled := false
	entry, writeErr := destinationProvider.StreamWrite(destinationRoot, target.path, reader, info, target.overwrite, func(delta int64) {
		bytesTransferred += delta
		if jobContext != nil {
			s.updateJobTaskProgress(jobContext.jobID, jobContext.taskIndex, bytesTransferred, info.Size, 0)
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
		s.updateJobTaskProgress(jobContext.jobID, jobContext.taskIndex, bytesTransferred, verifyInfo.Size, 0)
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
		s.updateJobTaskProgress(jobContext.jobID, jobContext.taskIndex, actualSize, &actualSize, 0)
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
	children := make([]TransferItemResult, 0, len(entries))
	for _, child := range entries {
		childSource := source
		childSource.Path = child.Path
		children = append(children, s.copyTree(childSource, sourceProvider, sourceRoot, child, destinationProvider, destinationRoot, joinTransferPath(target.path, child.Name), conflictPolicy, jobContext))
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

func transferTask(index int, source TransferSourceRequest, phase string, status string, message string, targetPath *string, result *TransferItemResult) TransferJobTask {
	progress := TransferTaskProgress{TotalItems: intPtr(1)}
	if result != nil {
		progress.ItemsCompleted = boolInt(resultSucceeded(*result))
		if result.Entry != nil {
			progress.TotalBytes = result.Entry.Metadata.Size
		}
	}
	return TransferJobTask{ID: fmt.Sprintf("task-%d", index+1), Intent: source.Intent, SourceTunnel: source.Tunnel, SourceRootID: source.RootID, SourcePath: source.Path, TargetPath: targetPath, Phase: phase, Status: status, Message: message, Progress: progress, Result: result, Children: resultToTaskChildren(fmt.Sprintf("task-%d", index+1), result)}
}

func tasksFromResults(sources []TransferSourceRequest, results []TransferItemResult) []TransferJobTask {
	tasks := make([]TransferJobTask, 0, len(sources))
	for idx, source := range sources {
		var result *TransferItemResult
		for resultIdx := range results {
			if results[resultIdx].SourceTunnel == source.Tunnel && results[resultIdx].SourceRootID == source.RootID && results[resultIdx].SourcePath == source.Path {
				result = &results[resultIdx]
				break
			}
		}
		if result == nil {
			tasks = append(tasks, transferTask(idx, source, "planned", "queued", "Waiting to start", nil, nil))
			continue
		}
		status := result.Status
		if hasConflict(*result) && status != "conflict" {
			status = "blocked"
		}
		tasks = append(tasks, transferTask(idx, source, status, status, result.Message, result.TargetPath, result))
	}
	return tasks
}

func resultToTaskChildren(parentID string, result *TransferItemResult) []TransferJobTask {
	if result == nil {
		return nil
	}
	children := make([]TransferJobTask, 0, len(result.Children))
	for idx := range result.Children {
		child := result.Children[idx]
		id := fmt.Sprintf("%s.%d", parentID, idx+1)
		progress := TransferTaskProgress{ItemsCompleted: boolInt(resultSucceeded(child)), TotalItems: intPtr(1)}
		if child.Entry != nil {
			progress.TotalBytes = child.Entry.Metadata.Size
		}
		children = append(children, TransferJobTask{ID: id, Intent: child.Intent, SourceTunnel: child.SourceTunnel, SourceRootID: child.SourceRootID, SourcePath: child.SourcePath, TargetPath: child.TargetPath, Phase: child.Status, Status: child.Status, Message: child.Message, Progress: progress, Result: &child, Children: resultToTaskChildren(id, &child)})
	}
	return children
}

func (s *Server) transferJobForOwner(jobID string, ownerID string) (storedTransferJob, bool) {
	s.transferMu.RLock()
	defer s.transferMu.RUnlock()
	stored, ok := s.transferJobs[jobID]
	return stored, ok && stored.ownerID == ownerID
}

func (s *Server) updateJob(jobID string, update func(TransferJobResponse) TransferJobResponse) {
	s.transferMu.Lock()
	defer s.transferMu.Unlock()
	stored, ok := s.transferJobs[jobID]
	if !ok {
		return
	}
	stored.job = update(stored.job)
	s.transferJobs[jobID] = stored
}

func (s *Server) updateJobTask(jobID string, index int, phase string, status string, message string, result *TransferItemResult) {
	s.updateJob(jobID, func(job TransferJobResponse) TransferJobResponse {
		if index >= 0 && index < len(job.Tasks) {
			task := job.Tasks[index]
			task.Phase = phase
			task.Status = status
			task.Message = message
			if result != nil {
				task.TargetPath = result.TargetPath
				task.Result = result
				task.Children = resultToTaskChildren(task.ID, result)
			}
			job.Tasks[index] = task
		}
		job.UpdatedAt = nowString()
		return job
	})
}

func (s *Server) updateJobTaskProgress(jobID string, index int, bytesTransferred int64, totalBytes *int64, itemsCompleted int) {
	s.updateJob(jobID, func(job TransferJobResponse) TransferJobResponse {
		if index >= 0 && index < len(job.Tasks) {
			task := job.Tasks[index]
			if task.Phase == "planned" || task.Phase == "queued" {
				task.Phase = "running"
			}
			if task.Status == "queued" {
				task.Status = "running"
			}
			task.Progress.BytesTransferred = bytesTransferred
			if totalBytes != nil {
				task.Progress.TotalBytes = totalBytes
			}
			task.Progress.ItemsCompleted = itemsCompleted
			job.Tasks[index] = task
		}
		job.UpdatedAt = nowString()
		return job
	})
}

func (s *Server) isCanceled(jobID string) bool {
	s.transferMu.RLock()
	defer s.transferMu.RUnlock()
	return s.canceledTransferJobs[jobID]
}

func terminalJobStatus(status string) bool {
	switch status {
	case "completed", "failed", "canceled", "partial", "blocked":
		return true
	default:
		return false
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

func stringValue(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	return *value
}
