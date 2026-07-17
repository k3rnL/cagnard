package api

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/auth"
	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

const taskProgressInterval = 100 * time.Millisecond
const taskProgressByteStep int64 = 1024 * 1024

var errInvalidDownloadRange = errors.New("requested download range is not satisfiable")

func (s *Server) startDownloadTask(w http.ResponseWriter, r *http.Request) {
	var request DownloadTaskRequest
	if !decodeJSONBody(w, r, &request) {
		return
	}
	job, apiErr := s.startDownloadTaskRequest(requestIdentity(r), request)
	if apiErr != nil {
		writeAPIError(w, apiErr.Status, apiErr.Error)
		return
	}
	writeJSON(w, http.StatusCreated, job)
}

func (s *Server) startDownloadTaskRequest(identity auth.RequestIdentity, request DownloadTaskRequest) (TaskResponse, *transferAPIError) {
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		return TaskResponse{}, authAPIError(failure)
	}
	if len(request.Sources) == 0 {
		return TaskResponse{}, badRequestAPIError("empty_selection", "Select at least one item to download")
	}

	tasks := make([]TaskItem, 0, len(request.Sources))
	validated := make([]TaskSourceRequest, 0, len(request.Sources))
	archive := len(request.Sources) != 1
	for index, source := range request.Sources {
		source.Tunnel = strings.TrimSpace(source.Tunnel)
		source.RootID = strings.TrimSpace(source.RootID)
		cleaned, err := validateRelativeTaskPath(source.Path, false)
		if err != nil {
			return TaskResponse{}, badRequestAPIError("invalid_source_path", fmt.Sprintf("Download source %d has an invalid path", index+1))
		}
		root, rootErr := s.rootForIdentity(identity, source.Tunnel, source.RootID, false)
		if rootErr != nil {
			return TaskResponse{}, rootErr
		}
		provider, err := s.registry.Provider(root.ProviderID)
		if err != nil {
			return TaskResponse{}, badRequestAPIError("unknown_provider", "Storage provider is unavailable")
		}
		entry, err := provider.Stat(root, cleaned)
		if err != nil {
			op := operationError(err)
			return TaskResponse{}, badRequestAPIError(op.Code, op.Message)
		}
		archive = archive || entry.Kind == "directory"
		source.Path = cleaned
		validated = append(validated, source)
		task := taskForSource("download", index, source, entry.Metadata.Size)
		task.Name = entry.Name
		task.Kind = entry.Kind
		tasks = append(tasks, task)
	}
	request.Sources = validated
	fileName := downloadFileName(tasks, archive)
	now := nowString()
	jobID := newJobID()
	job := TaskResponse{
		ID:        jobID,
		Status:    "pending",
		Message:   "Ready to download",
		CreatedAt: now,
		UpdatedAt: now,
		Operation: "download",
		Revision:  1,
		Download:  &TaskDownloadDescriptor{URL: "/api/tasks/" + jobID + "/content", FileName: fileName, Archive: archive},
		Tasks:     tasks,
	}
	job.Progress = aggregateTaskProgress(job.Tasks)
	ctx, cancel := context.WithCancel(context.Background())
	s.tasks.mu.Lock()
	s.pruneTransferJobsLocked(resolved.Profile.ID, time.Now())
	s.tasks.jobs[jobID] = indexStoredTask(storedTransferJob{ownerID: resolved.Profile.ID, job: job, ctx: ctx, cancel: cancel, downloadRequest: &request})
	s.tasks.mu.Unlock()
	return job, nil
}

func downloadFileName(tasks []TaskItem, archive bool) string {
	if len(tasks) == 1 {
		name := safeFileName(tasks[0].Name)
		if !archive {
			return name
		}
		name = strings.TrimSuffix(name, path.Ext(name))
		if name != "" {
			return name + ".zip"
		}
	}
	return "cagnard-download.zip"
}

func (s *Server) downloadTaskContent(w http.ResponseWriter, r *http.Request) {
	identity := requestIdentity(r)
	resolved, failure := s.resolver.Resolve(identity)
	if failure != nil {
		writeAuthFailure(w, failure)
		return
	}
	jobID := r.PathValue("taskId")

	s.tasks.mu.Lock()
	stored, ok := s.tasks.jobs[jobID]
	if !ok || stored.ownerID != resolved.Profile.ID || stored.downloadRequest == nil || stored.job.Operation != "download" {
		s.tasks.mu.Unlock()
		writeAPIError(w, http.StatusNotFound, APIError{Code: "not_found", Message: "Download task was not found"})
		return
	}
	if stored.job.Status != "pending" {
		s.tasks.mu.Unlock()
		writeAPIError(w, http.StatusConflict, APIError{Code: "download_unavailable", Message: "This download is no longer available"})
		return
	}
	request := *stored.downloadRequest
	job := stored.job
	stored.job.Status = "running"
	stored.job.Message = "Downloading"
	stored.job.UpdatedAt = nowString()
	stored.job.Revision++
	s.tasks.jobs[jobID] = indexStoredTask(stored)
	s.tasks.mu.Unlock()

	ctx, cancel := mergeRequestContext(stored.ctx, r.Context())
	defer cancel()
	w.Header().Set("Cache-Control", "private, no-store")
	var streamErr error
	if job.Download != nil && job.Download.Archive {
		streamErr = s.streamTaskZIP(ctx, jobID, identity, request, job.Download.FileName, w)
	} else {
		streamErr = s.streamTaskFile(ctx, jobID, identity, request.Sources[0], r, w)
	}
	if streamErr != nil {
		log.Printf("download task %s failed: %v", jobID, streamErr)
		s.finishDownloadTask(jobID, downloadFailureStatus(s.isCanceled(jobID)), "Download did not finish", streamErr)
		return
	}
	s.finishDownloadTask(jobID, "completed", "Download completed", nil)
}

func mergeRequestContext(taskContext context.Context, requestContext context.Context) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(taskContext)
	go func() {
		select {
		case <-requestContext.Done():
			cancel()
		case <-ctx.Done():
		}
	}()
	return ctx, cancel
}

func downloadFailureStatus(explicitlyCanceled bool) string {
	if explicitlyCanceled {
		return "canceled"
	}
	return "error"
}

func (s *Server) streamTaskFile(ctx context.Context, jobID string, identity auth.RequestIdentity, source TaskSourceRequest, r *http.Request, w http.ResponseWriter) error {
	root, provider, apiErr := s.taskSourceProvider(identity, source, false)
	if apiErr != nil {
		return errors.New(apiErr.Error.Message)
	}
	info, err := provider.ContentInfo(root, source.Path)
	if err != nil {
		return err
	}
	size := int64(-1)
	if info.Size != nil {
		size = *info.Size
	}
	var requested *byteRange
	if header := r.Header.Get("Range"); header != "" && size >= 0 {
		var unsatisfiable bool
		requested, unsatisfiable = parseByteRange(header, size)
		if unsatisfiable {
			w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", size))
			writeAPIError(w, http.StatusRequestedRangeNotSatisfiable, APIError{Code: "storage_range_invalid", Message: "Requested range is not satisfiable"})
			return errInvalidDownloadRange
		}
	}
	contentType := "application/octet-stream"
	if info.MIMEType != nil && *info.MIMEType != "" {
		contentType = *info.MIMEType
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, safeFileName(info.FileName)))
	w.Header().Set("Accept-Ranges", "bytes")
	total := info.Size
	if requested != nil {
		length := requested.end - requested.start + 1
		total = &length
		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", requested.start, requested.end, size))
		w.Header().Set("Content-Length", strconv.FormatInt(length, 10))
		w.WriteHeader(http.StatusPartialContent)
	} else {
		if size >= 0 {
			w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
		}
		w.WriteHeader(http.StatusOK)
	}

	sourceProgress := newTaskByteReporter(s, jobID, transferTaskID(0), total, false)
	deliveryProgress := newTaskByteReporter(s, jobID, transferTaskID(0), total, true)
	output := &reportingWriter{ctx: ctx, output: w, report: deliveryProgress.Add}
	if requested != nil {
		reader, _, err := provider.RangeRead(root, source.Path, requested.start, requested.end-requested.start+1)
		if err != nil {
			return err
		}
		defer reader.Close()
		count, err := io.CopyBuffer(output, &contextReaderCloser{ctx: ctx, reader: reader}, make([]byte, 128*1024))
		sourceProgress.Add(count)
		sourceProgress.Finish()
		deliveryProgress.Finish()
		if err != nil {
			return err
		}
	} else {
		_, err = provider.StreamReadContext(ctx, root, source.Path, output, sourceProgress.Add)
		sourceProgress.Finish()
		deliveryProgress.Finish()
		if err != nil {
			return err
		}
	}
	s.markTaskItemFinished(jobID, transferTaskID(0), "completed", "Downloaded")
	return nil
}

type zipTaskStream struct {
	server      *Server
	jobID       string
	identity    auth.RequestIdentity
	ctx         context.Context
	writer      *zip.Writer
	fallbackMod time.Time
	usedNames   map[string]int
	failures    int
	delivery    *taskByteReporter
	archivePath map[string]string
}

func (s *Server) streamTaskZIP(ctx context.Context, jobID string, identity auth.RequestIdentity, request DownloadTaskRequest, fileName string, w http.ResponseWriter) error {
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, safeFileName(fileName)))
	w.WriteHeader(http.StatusOK)
	delivery := newTaskByteReporter(s, jobID, transferTaskID(0), nil, true)
	output := &reportingWriter{ctx: ctx, output: w, report: delivery.Add}
	zipWriter := zip.NewWriter(output)
	stream := &zipTaskStream{
		server: s, jobID: jobID, identity: identity, ctx: ctx, writer: zipWriter,
		fallbackMod: time.Now().UTC(), usedNames: map[string]int{}, delivery: delivery, archivePath: map[string]string{},
	}
	for index, source := range request.Sources {
		if err := ctx.Err(); err != nil {
			_ = zipWriter.Close()
			return err
		}
		root, provider, apiErr := s.taskSourceProvider(identity, source, false)
		if apiErr != nil {
			stream.failures++
			s.markTaskItemFinished(jobID, transferTaskID(index), "error", "Source is unavailable")
			continue
		}
		entry, err := provider.Stat(root, source.Path)
		if err != nil {
			stream.failures++
			s.markTaskItemFinished(jobID, transferTaskID(index), "error", "Source is unavailable")
			continue
		}
		topName := stream.uniqueName(sanitizeArchiveComponent(entry.Name))
		if err := stream.writeEntry(root, provider, source, entry, topName, transferTaskID(index), true); err != nil {
			if isContextCancellation(err) {
				_ = zipWriter.Close()
				return err
			}
			stream.failures++
			log.Printf("download task %s item %s failed: %v", jobID, transferTaskID(index), err)
		}
	}
	closeErr := zipWriter.Close()
	delivery.Finish()
	if closeErr != nil {
		return closeErr
	}
	if stream.failures > 0 {
		s.updateJob(jobID, func(job TaskResponse) TaskResponse {
			if job.Status != "canceled" {
				job.Status = "partial"
				job.Message = "Archive downloaded with some unavailable items"
			}
			return job
		})
	}
	return nil
}

func (stream *zipTaskStream) writeEntry(root storage.ResolvedStorageRoot, provider storage.StorageProvider, source TaskSourceRequest, entry storage.StorageEntry, archiveName string, taskID string, selected bool) error {
	if err := stream.ctx.Err(); err != nil {
		return err
	}
	if entry.Kind == "directory" {
		name := strings.TrimSuffix(archiveName, "/") + "/"
		header := &zip.FileHeader{Name: name, Method: zip.Store, Modified: stream.entryModifiedTime(entry)}
		header.SetMode(0o755 | fs.ModeDir)
		if _, err := stream.writer.CreateHeader(header); err != nil {
			stream.server.markTaskItemFinished(stream.jobID, taskID, "error", "Could not add directory to archive")
			return err
		}
		children, err := listAllTaskEntries(stream.ctx, provider, root, entry.Path)
		if err != nil {
			stream.server.markTaskItemFinished(stream.jobID, taskID, "error", "Could not list directory")
			return err
		}
		for _, child := range children {
			childID := deleteChildID(taskID, child.Path)
			childName := stream.uniqueName(strings.TrimSuffix(name, "/") + "/" + sanitizeArchiveComponent(child.Name))
			childTask := taskForSource("download", 0, TaskSourceRequest{Tunnel: source.Tunnel, RootID: source.RootID, Path: child.Path}, child.Metadata.Size)
			childTask.ID = childID
			childTask.Name = child.Name
			childTask.Kind = child.Kind
			stream.server.addOrUpdateTaskChild(stream.jobID, taskID, childTask)
			if err := stream.writeEntry(root, provider, source, child, childName, childID, false); err != nil {
				if isContextCancellation(err) {
					return err
				}
				stream.failures++
				log.Printf("download task %s item %s failed: %v", stream.jobID, childID, err)
			}
		}
		status := "completed"
		message := "Added directory to archive"
		if taskHasFailedChildren(stream.server, stream.jobID, taskID) {
			status, message = "partial", "Some directory items were unavailable"
		}
		stream.server.markTaskItemFinished(stream.jobID, taskID, status, message)
		return nil
	}

	header := &zip.FileHeader{Name: archiveName, Method: zipMethod(entry), Modified: stream.entryModifiedTime(entry)}
	header.SetMode(0o644)
	entryWriter, err := stream.writer.CreateHeader(header)
	if err != nil {
		stream.server.markTaskItemFinished(stream.jobID, taskID, "error", "Could not add file to archive")
		return err
	}
	reporter := newTaskByteReporter(stream.server, stream.jobID, taskID, entry.Metadata.Size, false)
	_, err = provider.StreamReadContext(stream.ctx, root, entry.Path, entryWriter, reporter.Add)
	reporter.Finish()
	if err != nil {
		stream.server.markTaskItemFinished(stream.jobID, taskID, "error", "Could not read file")
		return err
	}
	stream.server.markTaskItemFinished(stream.jobID, taskID, "completed", "Added to archive")
	return nil
}

func (stream *zipTaskStream) entryModifiedTime(entry storage.StorageEntry) time.Time {
	if entry.Metadata.ModifiedTime != nil {
		if parsed, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(*entry.Metadata.ModifiedTime)); err == nil && !parsed.IsZero() {
			return parsed
		}
	}
	return stream.fallbackMod
}

func listAllTaskEntries(ctx context.Context, provider storage.StorageProvider, root storage.ResolvedStorageRoot, directory string) ([]storage.StorageEntry, error) {
	entries := make([]storage.StorageEntry, 0)
	var cursor *string
	for {
		if err := ctx.Err(); err != nil {
			return entries, err
		}
		page, err := provider.ListPage(root, directory, storage.ListOptions{PageSize: maxEntryPageSize, Cursor: cursor, SortKey: "name", SortDirection: "asc"})
		if err != nil {
			return entries, err
		}
		entries = append(entries, page.Entries...)
		if page.NextCursor == nil || *page.NextCursor == "" {
			return entries, nil
		}
		cursor = page.NextCursor
	}
}

func (stream *zipTaskStream) uniqueName(candidate string) string {
	candidate = strings.TrimPrefix(path.Clean("/"+candidate), "/")
	if candidate == "" || candidate == "." {
		candidate = "item"
	}
	key := strings.ToLower(candidate)
	stream.usedNames[key]++
	count := stream.usedNames[key]
	if count == 1 {
		return candidate
	}
	extension := path.Ext(candidate)
	base := strings.TrimSuffix(candidate, extension)
	for {
		unique := fmt.Sprintf("%s (%d)%s", base, count, extension)
		uniqueKey := strings.ToLower(unique)
		if stream.usedNames[uniqueKey] == 0 {
			stream.usedNames[uniqueKey] = 1
			return unique
		}
		count++
	}
}

func sanitizeArchiveComponent(value string) string {
	value = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(value, "/", "_"), "\\", "_"))
	value = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, value)
	if value == "" || value == "." || value == ".." {
		return "item"
	}
	return value
}

func zipMethod(entry storage.StorageEntry) uint16 {
	extension := strings.ToLower(path.Ext(entry.Name))
	switch extension {
	case ".zip", ".gz", ".bz2", ".xz", ".7z", ".rar", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp3", ".mp4", ".mkv", ".mov", ".pdf", ".parquet", ".avro":
		return zip.Store
	default:
		return zip.Deflate
	}
}

func (s *Server) taskSourceProvider(identity auth.RequestIdentity, source TaskSourceRequest, writable bool) (storage.ResolvedStorageRoot, storage.StorageProvider, *transferAPIError) {
	root, apiErr := s.rootForIdentity(identity, source.Tunnel, source.RootID, writable)
	if apiErr != nil {
		return storage.ResolvedStorageRoot{}, nil, apiErr
	}
	provider, err := s.registry.Provider(root.ProviderID)
	if err != nil {
		return storage.ResolvedStorageRoot{}, nil, badRequestAPIError("unknown_provider", "Storage provider is unavailable")
	}
	return root, provider, nil
}

func (s *Server) finishDownloadTask(jobID string, status string, message string, streamErr error) {
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		if job.Status == "canceled" {
			return job
		}
		if job.Status == "partial" && status == "completed" {
			return job
		}
		job.Status = status
		job.Message = message
		job.UpdatedAt = nowString()
		if streamErr != nil {
			for index := range job.Tasks {
				if !terminalTaskStatus(job.Tasks[index].Status) {
					markTransferTaskCanceled(&job.Tasks[index])
					if status == "error" {
						job.Tasks[index].Status = "error"
						job.Tasks[index].Phase = "error"
						job.Tasks[index].Message = "Download did not finish"
					}
				}
			}
		}
		return job
	})
}

func (s *Server) markTaskItemFinished(jobID string, itemID string, status string, message string) {
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		job.Tasks, _ = updateTaskByID(job.Tasks, itemID, func(task TaskItem) TaskItem {
			task.Phase = status
			task.Status = status
			task.Message = message
			if status == "completed" {
				if task.Progress.TotalBytes != nil {
					task.Progress.BytesTransferred = *task.Progress.TotalBytes
				}
				if task.Progress.TotalItems != nil {
					task.Progress.ItemsCompleted = *task.Progress.TotalItems
				}
			}
			return task
		})
		recomputeTaskProgress(job.Tasks)
		job.UpdatedAt = nowString()
		return job
	})
}

func taskHasFailedChildren(s *Server, jobID string, taskID string) bool {
	s.tasks.mu.RLock()
	defer s.tasks.mu.RUnlock()
	stored, ok := s.tasks.jobs[jobID]
	if !ok {
		return false
	}
	task, found := findTaskItem(stored.job.Tasks, taskID)
	if !found {
		return false
	}
	for _, child := range flattenTaskItems(task.Children) {
		if child.Status == "error" || child.Status == "partial" {
			return true
		}
	}
	return false
}

type taskByteReporter struct {
	mu        sync.Mutex
	server    *Server
	jobID     string
	itemID    string
	total     *int64
	delivery  bool
	current   int64
	reported  int64
	lastFlush time.Time
}

func newTaskByteReporter(server *Server, jobID string, itemID string, total *int64, delivery bool) *taskByteReporter {
	return &taskByteReporter{server: server, jobID: jobID, itemID: itemID, total: total, delivery: delivery, lastFlush: time.Now()}
}

func (reporter *taskByteReporter) Add(delta int64) {
	if delta <= 0 {
		return
	}
	reporter.mu.Lock()
	reporter.current += delta
	shouldFlush := reporter.current-reporter.reported >= taskProgressByteStep || time.Since(reporter.lastFlush) >= taskProgressInterval
	current := reporter.current
	if shouldFlush {
		reporter.reported = current
		reporter.lastFlush = time.Now()
	}
	reporter.mu.Unlock()
	if shouldFlush {
		reporter.server.setTaskByteProgress(reporter.jobID, reporter.itemID, current, reporter.total, reporter.delivery)
	}
}

func (reporter *taskByteReporter) Finish() {
	reporter.mu.Lock()
	current := reporter.current
	reporter.reported = current
	reporter.lastFlush = time.Now()
	reporter.mu.Unlock()
	reporter.server.setTaskByteProgress(reporter.jobID, reporter.itemID, current, reporter.total, reporter.delivery)
}

func (s *Server) setTaskByteProgress(jobID string, itemID string, current int64, total *int64, delivery bool) {
	s.updateJob(jobID, func(job TaskResponse) TaskResponse {
		job.Tasks, _ = updateTaskByID(job.Tasks, itemID, func(task TaskItem) TaskItem {
			if delivery {
				task.Progress.BytesDelivered = current
				if total != nil {
					task.Progress.TotalDelivered = total
				}
			} else {
				task.Progress.BytesTransferred = current
				if total != nil {
					task.Progress.TotalBytes = total
				}
			}
			if task.Status == "pending" {
				task.Status = "running"
				task.Phase = "running"
			}
			return task
		})
		recomputeTaskProgress(job.Tasks)
		job.UpdatedAt = nowString()
		return job
	})
}

type reportingWriter struct {
	ctx    context.Context
	output io.Writer
	report func(int64)
}

func (writer *reportingWriter) Write(bytes []byte) (int, error) {
	if err := writer.ctx.Err(); err != nil {
		return 0, err
	}
	written, err := writer.output.Write(bytes)
	if written > 0 && writer.report != nil {
		writer.report(int64(written))
	}
	return written, err
}

type contextReaderCloser struct {
	ctx    context.Context
	reader io.ReadCloser
}

func (reader *contextReaderCloser) Read(bytes []byte) (int, error) {
	if err := reader.ctx.Err(); err != nil {
		return 0, err
	}
	return reader.reader.Read(bytes)
}

func (reader *contextReaderCloser) Close() error {
	return reader.reader.Close()
}
