package api

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"log"
	"net/http"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/auth"
	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

type deleteSourceOutcome struct {
	index   int
	summary storage.DeleteSummary
	err     error
}

func (s *Server) startDeleteTask(w http.ResponseWriter, r *http.Request) {
	var request DeleteTaskRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}
	if !request.Confirmed {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "confirmation_required", Message: "Delete requires explicit confirmation"})
		return
	}
	job, apiErr := s.startDeleteTaskRequest(requestIdentity(r), request)
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusAccepted, job)
}

func (s *Server) startDeleteTaskRequest(identity auth.RequestIdentity, request DeleteTaskRequest) (TaskResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return TaskResponse{}, authAPIError(failure)
	}
	if len(request.Sources) == 0 {
		return TaskResponse{}, badRequestAPIError("empty_selection", "Select at least one item to delete")
	}
	location, apiErr := validateTaskLocation(request.InitiatedFrom)
	if apiErr != nil {
		return TaskResponse{}, apiErr
	}
	if _, rootErr := s.rootForIdentity(identity, location.Tunnel, location.RootID, false); rootErr != nil {
		return TaskResponse{}, rootErr
	}

	tasks := make([]TaskItem, 0, len(request.Sources))
	validated := make([]TaskSourceRequest, 0, len(request.Sources))
	for index, source := range request.Sources {
		source.Tunnel = strings.TrimSpace(source.Tunnel)
		source.RootID = strings.TrimSpace(source.RootID)
		cleaned, err := validateRelativeTaskPath(source.Path, false)
		if err != nil {
			return TaskResponse{}, badRequestAPIError("invalid_source_path", fmt.Sprintf("Delete source %d has an invalid path", index+1))
		}
		if _, rootErr := s.rootForIdentity(identity, source.Tunnel, source.RootID, true); rootErr != nil {
			return TaskResponse{}, rootErr
		}
		source.Path = cleaned
		validated = append(validated, source)
		tasks = append(tasks, taskForSource("delete", index, source, nil))
	}
	request.Sources = validated
	request.InitiatedFrom = location
	now := nowString()
	jobID := newJobID()
	job := TaskResponse{
		ID:            jobID,
		Status:        "pending",
		Message:       "Delete task pending",
		CreatedAt:     now,
		UpdatedAt:     now,
		Operation:     "delete",
		Revision:      1,
		InitiatedFrom: &location,
		Tasks:         tasks,
	}
	job.Progress = aggregateTaskProgress(job.Tasks)
	ctx, cancel := context.WithCancel(context.Background())
	s.tasks.mu.Lock()
	s.pruneTransferJobsLocked(resolved.Profile.ID, time.Now())
	s.tasks.jobs[jobID] = indexStoredTask(storedTransferJob{ownerID: resolved.Profile.ID, job: job, ctx: ctx, cancel: cancel, deleteRequest: &request})
	s.tasks.mu.Unlock()
	go s.runDeleteTask(jobID, identity, request)
	return job, nil
}

func taskForSource(operation string, index int, source TaskSourceRequest, totalBytes *int64) TaskItem {
	totalItems := 1
	return TaskItem{
		ID:           transferTaskID(index),
		Name:         path.Base(source.Path),
		Intent:       operation,
		SourceTunnel: source.Tunnel,
		SourceRootID: source.RootID,
		SourcePath:   source.Path,
		Phase:        "pending",
		Status:       "pending",
		Message:      "Waiting to start",
		Progress:     TaskProgress{TotalBytes: totalBytes, TotalItems: &totalItems},
	}
}

func (s *Server) runDeleteTask(jobID string, identity auth.RequestIdentity, request DeleteTaskRequest) {
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		if job.Status != "canceled" {
			job.Status = "running"
			job.Message = "Deleting selected items"
			job.UpdatedAt = nowString()
		}
		return job
	})

	sem := make(chan struct{}, s.transferConcurrency())
	outcomes := make(chan deleteSourceOutcome, len(request.Sources))
	var wait sync.WaitGroup
	for index, source := range request.Sources {
		wait.Add(1)
		go func(index int, source TaskSourceRequest) {
			defer wait.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-s.taskContext(jobID).Done():
				outcomes <- deleteSourceOutcome{index: index, err: context.Canceled}
				return
			}
			outcomes <- s.deleteTaskSource(jobID, index, identity, source)
		}(index, source)
	}
	wait.Wait()
	close(outcomes)

	deleted, failed := 0, 0
	canceled := s.isCanceled(jobID)
	for outcome := range outcomes {
		deleted += outcome.summary.Deleted
		failed += outcome.summary.Failed
		if outcome.err != nil && !isContextCancellation(outcome.err) {
			if outcome.summary.Failed == 0 {
				failed++
			}
			log.Printf("delete task %s source %d failed: %v", jobID, outcome.index+1, outcome.err)
		}
	}
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		job.MutationCount = deleted
		job.UpdatedAt = nowString()
		switch {
		case canceled:
			job.Status = "canceled"
			job.Message = fmt.Sprintf("Delete canceled after removing %d item%s; completed deletions cannot be restored", deleted, pluralSuffix(deleted))
		case failed > 0 && deleted > 0:
			job.Status = "partial"
			job.Message = fmt.Sprintf("Deleted %d item%s; some items could not be deleted", deleted, pluralSuffix(deleted))
		case failed > 0:
			job.Status = "error"
			job.Message = "Selected items could not be deleted"
		default:
			job.Status = "completed"
			job.Message = fmt.Sprintf("Deleted %d item%s", deleted, pluralSuffix(deleted))
		}
		return job
	})
}

func (s *Server) deleteTaskSource(jobID string, index int, identity auth.RequestIdentity, source TaskSourceRequest) deleteSourceOutcome {
	taskID := transferTaskID(index)
	ctx := s.taskContext(jobID)
	root, apiErr := s.rootForIdentity(identity, source.Tunnel, source.RootID, true)
	if apiErr != nil {
		s.finishDeleteSource(jobID, taskID, "error", apiErr.Error.Message, false)
		return deleteSourceOutcome{index: index, err: fmt.Errorf("%s", apiErr.Error.Message)}
	}
	provider, err := s.registry.Provider(root.ProviderID)
	if err != nil {
		s.finishDeleteSource(jobID, taskID, "error", "Storage provider is unavailable", false)
		return deleteSourceOutcome{index: index, err: err}
	}
	entry, statErr := provider.Stat(root, source.Path)
	if statErr != nil {
		s.finishDeleteSource(jobID, taskID, "error", "Item could not be inspected", false)
		return deleteSourceOutcome{index: index, err: statErr}
	}
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		job.Tasks, _ = updateTaskByID(job.Tasks, taskID, func(task TaskItem) TaskItem {
			task.Name = entry.Name
			task.Kind = entry.Kind
			task.Progress.TotalBytes = entry.Metadata.Size
			return task
		})
		job.UpdatedAt = nowString()
		return job
	})
	s.updateJobTaskByID(jobID, taskID, "running", "running", "Deleting", nil)

	rootEventSeen := false
	rootDeleted := false
	summary, deleteErr := provider.DeleteRecursive(ctx, root, source.Path, func(event storage.DeleteItemEvent) {
		eventPath := normalizeTaskPath(event.Path)
		sourcePath := normalizeTaskPath(source.Path)
		if eventPath == sourcePath {
			rootEventSeen = true
			rootDeleted = event.Status == "completed"
			return
		}

		parentID := taskID
		relativePath := strings.TrimPrefix(eventPath, sourcePath+"/")
		parts := strings.Split(relativePath, "/")
		currentPath := sourcePath
		for _, part := range parts[:max(0, len(parts)-1)] {
			currentPath = joinTransferPath(currentPath, part)
			placeholderID := deleteChildID(taskID, currentPath)
			s.ensureDeleteTaskAncestor(jobID, parentID, TaskItem{
				ID: placeholderID, Name: part, Kind: "directory", Intent: "delete",
				SourceTunnel: source.Tunnel, SourceRootID: source.RootID, SourcePath: currentPath,
				Phase: "running", Status: "running", Message: "Deleting",
				Progress: TaskProgress{TotalItems: intPtr(1)},
			})
			parentID = placeholderID
		}

		childID := deleteChildID(taskID, eventPath)
		progress := TaskProgress{TotalBytes: event.Size, TotalItems: intPtr(1)}
		status := event.Status
		message := event.Message
		if status == "running" {
			message = "Deleting"
		} else if status == "completed" {
			progress.ItemsCompleted = 1
			if event.Size != nil {
				progress.BytesTransferred = *event.Size
			}
			message = "Deleted"
		} else if status == "error" {
			message = "Could not delete item"
		}
		child := TaskItem{
			ID: childID, Name: event.Name, Kind: event.Kind, Intent: "delete",
			SourceTunnel: source.Tunnel, SourceRootID: source.RootID, SourcePath: eventPath,
			Phase: status, Status: status, Message: message, Progress: progress,
		}
		s.addOrUpdateTaskChild(jobID, parentID, child)
	})
	if !rootEventSeen && deleteErr == nil && entry.Kind != "directory" {
		rootDeleted = true
	}

	status := "completed"
	message := fmt.Sprintf("Deleted %d item%s", summary.Deleted, pluralSuffix(summary.Deleted))
	if isContextCancellation(deleteErr) {
		status = "canceled"
		message = "Canceled; completed deletions cannot be restored"
	} else if deleteErr != nil && summary.Deleted > 0 {
		status = "partial"
		message = "Some items could not be deleted"
	} else if deleteErr != nil {
		status = "error"
		message = "Item could not be deleted"
	}
	s.finishDeleteSource(jobID, taskID, status, message, rootDeleted)
	return deleteSourceOutcome{index: index, summary: summary, err: deleteErr}
}

func (s *Server) addOrUpdateTaskChild(jobID string, parentID string, child TaskItem) {
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		var found bool
		job.Tasks, found = updateTaskByID(job.Tasks, child.ID, func(existing TaskItem) TaskItem {
			existing.Name = child.Name
			existing.Kind = child.Kind
			existing.Phase = child.Phase
			existing.Status = child.Status
			existing.Message = child.Message
			existing.Progress = child.Progress
			return existing
		})
		if !found {
			job.Tasks, _ = addTaskChild(job.Tasks, parentID, child)
		}
		recomputeTaskProgress(job.Tasks)
		job.UpdatedAt = nowString()
		return job
	})
}

func (s *Server) ensureDeleteTaskAncestor(jobID string, parentID string, ancestor TaskItem) {
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		var found bool
		job.Tasks, found = updateTaskByID(job.Tasks, ancestor.ID, func(existing TaskItem) TaskItem { return existing })
		if !found {
			job.Tasks, _ = addTaskChild(job.Tasks, parentID, ancestor)
		}
		recomputeTaskProgress(job.Tasks)
		job.UpdatedAt = nowString()
		return job
	})
}

func (s *Server) finishDeleteSource(jobID string, taskID string, status string, message string, rootDeleted bool) {
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		job.Tasks, _ = updateTaskByID(job.Tasks, taskID, func(task TaskItem) TaskItem {
			finalizeDeleteDirectoryPlaceholders(task.Children, status)
			task.Phase = status
			task.Status = status
			task.Message = message
			if len(task.Children) == 0 && rootDeleted {
				if task.Progress.TotalBytes != nil {
					task.Progress.BytesTransferred = *task.Progress.TotalBytes
				}
			}
			return task
		})
		recomputeTaskProgress(job.Tasks)
		job.Tasks, _ = updateTaskByID(job.Tasks, taskID, func(task TaskItem) TaskItem {
			recomputeDeleteItemProgress(&task)
			return task
		})
		job.UpdatedAt = nowString()
		return job
	})
}

func recomputeDeleteItemProgress(task *TaskItem) (completed int, total int) {
	total = 1
	if task.Status == "completed" || task.Status == "skipped" {
		completed = 1
	}
	for index := range task.Children {
		childCompleted, childTotal := recomputeDeleteItemProgress(&task.Children[index])
		completed += childCompleted
		total += childTotal
	}
	task.Progress.ItemsCompleted = completed
	task.Progress.TotalItems = intPtr(total)
	return completed, total
}

func finalizeDeleteDirectoryPlaceholders(items []TaskItem, sourceStatus string) {
	for index := range items {
		finalizeDeleteDirectoryPlaceholders(items[index].Children, sourceStatus)
		if items[index].Kind != "directory" || terminalTaskStatus(items[index].Status) {
			continue
		}
		switch sourceStatus {
		case "completed":
			items[index].Status, items[index].Phase, items[index].Message = "completed", "completed", "Deleted"
		case "canceled":
			items[index].Status, items[index].Phase, items[index].Message = "canceled", "canceled", "Canceled after partial deletion"
		case "partial":
			items[index].Status, items[index].Phase, items[index].Message = "partial", "partial", "Some items could not be deleted"
		case "error":
			items[index].Status, items[index].Phase, items[index].Message = "error", "error", "Directory could not be deleted"
		}
	}
}

func deleteChildID(parentID string, itemPath string) string {
	digest := sha256.Sum256([]byte(itemPath))
	return fmt.Sprintf("%s.%x", parentID, digest[:8])
}

func isContextCancellation(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
}
