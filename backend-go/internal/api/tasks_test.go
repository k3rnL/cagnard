package api

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

func TestGenericTaskRoutesShareTransferRecordsAndIsolateOwners(t *testing.T) {
	server, home, _ := newTransferTestServer(t)
	writeTestFile(t, filepath.Join(home, "source.txt"), []byte("task data"))

	job := postJSON[TaskResponse](t, server, "/api/tasks/transfers", "", `{
  "sources":[{"intent":"copy","tunnel":"personal","rootId":"home","path":"source.txt"}],
  "destination":{"tunnel":"personal","rootId":"home","path":"copies"},
  "initiatedFrom":{"tunnel":"personal","rootId":"home","path":""},
  "conflictPolicy":"fail"
}`)
	final := waitTask(t, server, job.ID)
	if final.Status != "completed" || final.MutationCount != 1 || final.Revision <= job.Revision {
		t.Fatalf("unexpected final generic task: %#v", final)
	}
	legacy := getJSON[TaskResponse](t, server, "/api/storage/transfer/jobs/"+job.ID)
	if legacy.ID != final.ID || legacy.Revision != final.Revision {
		t.Fatalf("legacy route did not expose the same record: %#v vs %#v", legacy, final)
	}
	list := getJSON[TaskListResponse](t, server, "/api/tasks")
	if len(list.Tasks) != 1 || list.Tasks[0].ID != job.ID {
		t.Fatalf("unexpected generic task list: %#v", list)
	}
	if len(list.Tasks[0].Tasks) != 0 || len(list.Tasks[0].Results) != 0 {
		t.Fatalf("generic task list embedded paginated item details: %#v", list.Tasks[0])
	}
	detail := getJSON[TaskResponse](t, server, "/api/tasks/"+job.ID)
	if len(detail.Tasks) != 0 || len(detail.Results) != 0 {
		t.Fatalf("generic task detail embedded paginated item details: %#v", detail)
	}
	items := getJSON[TaskItemPage](t, server, "/api/tasks/"+job.ID+"/items?pageSize=1")
	if len(items.Items) != 1 || items.Items[0].ID == "" || items.TotalCount < 1 {
		t.Fatalf("unexpected task items: %#v", items)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/tasks/"+job.ID, nil)
	request.Header.Set("X-Cagnard-User", "bob")
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("foreign task status = %d body = %s", response.Code, response.Body.String())
	}
}

func TestBackgroundDeleteRemovesDeepTreesAndReportsMutations(t *testing.T) {
	server, home, _ := newTransferTestServer(t)
	writeTestFile(t, filepath.Join(home, "remove", "nested", "one.txt"), []byte("one"))
	writeTestFile(t, filepath.Join(home, "remove", "two.txt"), []byte("two"))
	writeTestFile(t, filepath.Join(home, "keep.txt"), []byte("keep"))

	job := postJSON[TaskResponse](t, server, "/api/tasks/deletes", "", `{
  "sources":[{"tunnel":"personal","rootId":"home","path":"remove"}],
  "initiatedFrom":{"tunnel":"personal","rootId":"home","path":""},
  "confirmed":true
}`)
	final := waitTask(t, server, job.ID)
	if final.Status != "completed" || final.MutationCount < 4 {
		t.Fatalf("unexpected delete result: %#v", final)
	}
	if final.Progress.TotalItems == nil || final.Progress.ItemsCompleted != final.MutationCount || *final.Progress.TotalItems != final.MutationCount {
		t.Fatalf("delete aggregate item progress does not match mutations: %#v", final.Progress)
	}
	if _, err := os.Stat(filepath.Join(home, "remove")); !os.IsNotExist(err) {
		t.Fatalf("deleted tree still exists: %v", err)
	}
	if _, err := os.Stat(filepath.Join(home, "keep.txt")); err != nil {
		t.Fatalf("unrelated file was removed: %v", err)
	}
	page := getJSON[TaskItemPage](t, server, "/api/tasks/"+job.ID+"/items?pageSize=2")
	if page.TotalCount < 4 || len(page.Items) != 2 || page.NextPageRef == nil {
		t.Fatalf("delete details were not paginated: %#v", page)
	}
	allItems := getJSON[TaskItemPage](t, server, "/api/tasks/"+job.ID+"/items?pageSize=100")
	if allItems.TotalCount != 4 {
		t.Fatalf("selected delete root was duplicated in task details: %#v", allItems.Items)
	}
	byPath := make(map[string]TaskItem, len(allItems.Items))
	for _, item := range allItems.Items {
		if _, exists := byPath[item.SourcePath]; exists {
			t.Fatalf("duplicate delete path %q in %#v", item.SourcePath, allItems.Items)
		}
		byPath[item.SourcePath] = item
	}
	if rootItem := byPath["remove"]; rootItem.Kind != "directory" || rootItem.Depth != 0 || rootItem.ParentID != nil {
		t.Fatalf("unexpected delete root item: %#v", rootItem)
	}
	nestedItem := byPath["remove/nested"]
	if nestedItem.Kind != "directory" || nestedItem.Depth != 1 || nestedItem.ParentID == nil || *nestedItem.ParentID != byPath["remove"].ID {
		t.Fatalf("unexpected nested delete item: %#v", nestedItem)
	}
	fileItem := byPath["remove/nested/one.txt"]
	if fileItem.Depth != 2 || fileItem.ParentID == nil || *fileItem.ParentID != nestedItem.ID {
		t.Fatalf("unexpected nested file item: %#v", fileItem)
	}
	for _, item := range allItems.Items {
		if item.Status != "completed" {
			t.Fatalf("completed delete retained active item %#v", item)
		}
	}
}

func TestBackgroundDeleteReportsPartialMixedOutcome(t *testing.T) {
	server, home, _ := newTransferTestServer(t)
	writeTestFile(t, filepath.Join(home, "remove.txt"), []byte("remove"))

	job := postJSON[TaskResponse](t, server, "/api/tasks/deletes", "", `{
  "sources":[
    {"tunnel":"personal","rootId":"home","path":"remove.txt"},
    {"tunnel":"personal","rootId":"home","path":"missing.txt"}
  ],
  "initiatedFrom":{"tunnel":"personal","rootId":"home","path":""},
  "confirmed":true
}`)
	final := waitTask(t, server, job.ID)
	if final.Status != "partial" || final.MutationCount != 1 || !strings.Contains(final.Message, "some items") {
		t.Fatalf("unexpected partial delete result: %#v", final)
	}
	if _, err := os.Stat(filepath.Join(home, "remove.txt")); !os.IsNotExist(err) {
		t.Fatalf("successful delete source still exists: %v", err)
	}
	items := getJSON[TaskItemPage](t, server, "/api/tasks/"+job.ID+"/items?pageSize=100")
	if items.TotalCount != 2 {
		t.Fatalf("unexpected partial delete details: %#v", items)
	}
	states := map[string]string{}
	for _, item := range items.Items {
		states[item.SourcePath] = item.Status
	}
	if states["remove.txt"] != "completed" || states["missing.txt"] != "error" {
		t.Fatalf("unexpected partial delete item states: %#v", states)
	}
}

func TestTaskDownloadsStreamFilesAndMixedZIPs(t *testing.T) {
	server, home, global := newTransferTestServer(t)
	content := bytes.Repeat([]byte("download-"), 128*1024)
	writeTestFile(t, filepath.Join(home, "large.bin"), content)

	fileTask := postJSON[TaskResponse](t, server, "/api/tasks/downloads", "", `{"sources":[{"tunnel":"personal","rootId":"home","path":"large.bin"}]}`)
	if fileTask.Status != "pending" || fileTask.Download == nil || fileTask.Download.Archive {
		t.Fatalf("unexpected file download task: %#v", fileTask)
	}
	foreignRequest := httptest.NewRequest(http.MethodGet, fileTask.Download.URL, nil)
	foreignRequest.Header.Set("X-Cagnard-User", "bob")
	foreignResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(foreignResponse, foreignRequest)
	if foreignResponse.Code != http.StatusNotFound {
		t.Fatalf("foreign download status = %d body = %s", foreignResponse.Code, foreignResponse.Body.String())
	}
	response := doTaskContentRequest(t, server, fileTask.Download.URL, "")
	if response.Code != http.StatusOK || !bytes.Equal(response.Body.Bytes(), content) {
		t.Fatalf("streamed file mismatch: status=%d size=%d", response.Code, response.Body.Len())
	}
	fileFinal := getJSON[TaskResponse](t, server, "/api/tasks/"+fileTask.ID)
	if fileFinal.Status != "completed" || fileFinal.Progress.BytesDelivered != int64(len(content)) {
		t.Fatalf("unexpected file download progress: %#v", fileFinal)
	}
	if stale := doTaskContentRequest(t, server, fileTask.Download.URL, ""); stale.Code != http.StatusConflict {
		t.Fatalf("reused download URL status = %d", stale.Code)
	}

	rangeTask := postJSON[TaskResponse](t, server, "/api/tasks/downloads", "", `{"sources":[{"tunnel":"personal","rootId":"home","path":"large.bin"}]}`)
	rangeResponse := doTaskContentRequest(t, server, rangeTask.Download.URL, "bytes=10-19")
	if rangeResponse.Code != http.StatusPartialContent || !bytes.Equal(rangeResponse.Body.Bytes(), content[10:20]) || rangeResponse.Header().Get("Content-Range") == "" {
		t.Fatalf("unexpected range download: status=%d headers=%v body=%q", rangeResponse.Code, rangeResponse.Header(), rangeResponse.Body.Bytes())
	}
	invalidRangeTask := postJSON[TaskResponse](t, server, "/api/tasks/downloads", "", `{"sources":[{"tunnel":"personal","rootId":"home","path":"large.bin"}]}`)
	invalidRange := doTaskContentRequest(t, server, invalidRangeTask.Download.URL, "bytes=999999999-")
	if invalidRange.Code != http.StatusRequestedRangeNotSatisfiable || invalidRange.Header().Get("Content-Range") == "" {
		t.Fatalf("unexpected invalid range response: status=%d headers=%v body=%q", invalidRange.Code, invalidRange.Header(), invalidRange.Body.String())
	}
	if invalidFinal := getJSON[TaskResponse](t, server, "/api/tasks/"+invalidRangeTask.ID); invalidFinal.Status != "error" {
		t.Fatalf("invalid range task status = %s message=%s", invalidFinal.Status, invalidFinal.Message)
	}

	writeTestFile(t, filepath.Join(home, "folder", "nested", "note.txt"), []byte("note"))
	if err := os.MkdirAll(filepath.Join(home, "folder", "empty"), 0o755); err != nil {
		t.Fatal(err)
	}
	noteModified := time.Date(2024, time.March, 4, 5, 6, 8, 0, time.UTC)
	emptyModified := time.Date(2023, time.February, 3, 4, 5, 6, 0, time.UTC)
	if err := os.Chtimes(filepath.Join(home, "folder", "nested", "note.txt"), noteModified, noteModified); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(filepath.Join(home, "folder", "empty"), emptyModified, emptyModified); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(home, "other.txt"), []byte("other"))
	zipTask := postJSON[TaskResponse](t, server, "/api/tasks/downloads", "", `{"sources":[
  {"tunnel":"personal","rootId":"home","path":"folder"},
  {"tunnel":"personal","rootId":"home","path":"other.txt"}
]}`)
	zipResponse := doTaskContentRequest(t, server, zipTask.Download.URL, "")
	if zipResponse.Code != http.StatusOK {
		t.Fatalf("zip status = %d body = %s", zipResponse.Code, zipResponse.Body.String())
	}
	reader, err := zip.NewReader(bytes.NewReader(zipResponse.Body.Bytes()), int64(zipResponse.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	files := map[string]string{}
	directories := map[string]bool{}
	modifiedTimes := map[string]time.Time{}
	for _, file := range reader.File {
		if strings.HasPrefix(file.Name, "/") || strings.Contains(file.Name, "../") {
			t.Fatalf("unsafe archive path: %q", file.Name)
		}
		modifiedTimes[file.Name] = file.Modified
		if file.FileInfo().IsDir() {
			directories[file.Name] = true
			continue
		}
		opened, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(opened)
		_ = opened.Close()
		if err != nil {
			t.Fatal(err)
		}
		files[file.Name] = string(data)
	}
	if files["folder/nested/note.txt"] != "note" || files["other.txt"] != "other" {
		t.Fatalf("unexpected archive entries: %#v", files)
	}
	if !directories["folder/empty/"] {
		t.Fatalf("empty archive directory missing: %#v", directories)
	}
	if !modifiedTimes["folder/nested/note.txt"].Equal(noteModified) || !modifiedTimes["folder/empty/"].Equal(emptyModified) {
		t.Fatalf("archive modification times were not preserved: %#v", modifiedTimes)
	}

	writeTestFile(t, filepath.Join(home, "duplicate.txt"), []byte("home"))
	writeTestFile(t, filepath.Join(global, "duplicate.txt"), []byte("global"))
	duplicateTask := postJSON[TaskResponse](t, server, "/api/tasks/downloads", "", `{"sources":[
  {"tunnel":"personal","rootId":"home","path":"duplicate.txt"},
  {"tunnel":"global","rootId":"shared","path":"duplicate.txt"}
]}`)
	duplicateResponse := doTaskContentRequest(t, server, duplicateTask.Download.URL, "")
	duplicateReader, err := zip.NewReader(bytes.NewReader(duplicateResponse.Body.Bytes()), int64(duplicateResponse.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	names := []string{duplicateReader.File[0].Name, duplicateReader.File[1].Name}
	if names[0] != "duplicate.txt" || names[1] != "duplicate (2).txt" {
		t.Fatalf("duplicate archive names = %#v", names)
	}
}

func TestZipEntryModifiedTimeUsesArchiveFallbackForMissingMetadata(t *testing.T) {
	fallback := time.Date(2026, time.July, 17, 20, 0, 0, 0, time.UTC)
	stream := zipTaskStream{fallbackMod: fallback}
	if actual := stream.entryModifiedTime(storage.StorageEntry{}); !actual.Equal(fallback) {
		t.Fatalf("missing timestamp fallback = %s", actual)
	}
	invalid := "not-a-time"
	entry := storage.StorageEntry{Metadata: storage.EntryMetadata{ModifiedTime: &invalid}}
	if actual := stream.entryModifiedTime(entry); !actual.Equal(fallback) {
		t.Fatalf("invalid timestamp fallback = %s", actual)
	}
}

func TestTaskDownloadStreamsCompleteConfiguredRoot(t *testing.T) {
	server, home, _ := newTransferTestServer(t)
	writeTestFile(t, filepath.Join(home, "top.txt"), []byte("top"))
	writeTestFile(t, filepath.Join(home, "nested", "child.txt"), []byte("child"))
	if err := os.MkdirAll(filepath.Join(home, "empty"), 0o755); err != nil {
		t.Fatal(err)
	}

	job := postJSON[TaskResponse](t, server, "/api/tasks/downloads", "", `{"sources":[{"tunnel":"personal","rootId":"home","path":""}]}`)
	if job.Download == nil || !job.Download.Archive || job.Download.FileName != "Home.zip" {
		t.Fatalf("unexpected root download descriptor: %#v", job)
	}
	response := doTaskContentRequest(t, server, job.Download.URL, "")
	if response.Code != http.StatusOK {
		t.Fatalf("root download status = %d body = %s", response.Code, response.Body.String())
	}
	reader, err := zip.NewReader(bytes.NewReader(response.Body.Bytes()), int64(response.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	files := map[string]string{}
	directories := map[string]bool{}
	for _, archived := range reader.File {
		if archived.FileInfo().IsDir() {
			directories[archived.Name] = true
			continue
		}
		opened, err := archived.Open()
		if err != nil {
			t.Fatal(err)
		}
		content, err := io.ReadAll(opened)
		_ = opened.Close()
		if err != nil {
			t.Fatal(err)
		}
		files[archived.Name] = string(content)
	}
	if files["Home/top.txt"] != "top" || files["Home/nested/child.txt"] != "child" {
		t.Fatalf("root archive omitted content: %#v", files)
	}
	if !directories["Home/"] || !directories["Home/empty/"] {
		t.Fatalf("root archive omitted directories: %#v", directories)
	}

	for _, body := range []string{
		`{"sources":[{"tunnel":"personal","rootId":"home","path":"../outside"}]}`,
		`{"sources":[{"tunnel":"personal","rootId":"home","path":"/absolute"}]}`,
	} {
		invalid := postRawJSON(t, server, "/api/tasks/downloads", body)
		if invalid.Code != http.StatusBadRequest {
			t.Fatalf("unsafe root download status = %d body = %s", invalid.Code, invalid.Body.String())
		}
	}
}

func TestDirectoryDownloadNamePreservesDots(t *testing.T) {
	name := downloadFileName([]TaskItem{{Name: "release.v1", Kind: "directory"}}, true)
	if name != "release.v1.zip" {
		t.Fatalf("directory archive name = %q", name)
	}
	name = downloadFileName([]TaskItem{{Name: "Finance / 2026\n", Kind: "directory"}}, true)
	if name != "Finance _ 2026.zip" {
		t.Fatalf("sanitized root archive name = %q", name)
	}
}

func TestTaskUploadStreamsManifestItemsAndResolvesConflicts(t *testing.T) {
	server, home, _ := newTransferTestServer(t)
	job := postJSON[TaskResponse](t, server, "/api/tasks/uploads", "", `{
  "destination":{"tunnel":"personal","rootId":"home","path":"uploads"},
  "initiatedFrom":{"tunnel":"personal","rootId":"home","path":""},
  "conflictPolicy":"fail",
  "items":[
    {"relativePath":"empty","kind":"directory"},
    {"relativePath":"nested/file.txt","kind":"file","size":7,"mimeType":"text/plain"}
  ]
}`)
	if job.Status != "pending" || len(job.Tasks) != 2 {
		t.Fatalf("unexpected upload task: %#v", job)
	}
	foreignRequest := httptest.NewRequest(http.MethodPut, "/api/tasks/"+job.ID+"/uploads/"+job.Tasks[1].ID, strings.NewReader("content"))
	foreignRequest.Header.Set("X-Cagnard-User", "bob")
	foreignResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(foreignResponse, foreignRequest)
	if foreignResponse.Code != http.StatusNotFound {
		t.Fatalf("foreign upload item status = %d body = %s", foreignResponse.Code, foreignResponse.Body.String())
	}
	putUploadItem(t, server, job.ID, job.Tasks[0].ID, nil, http.StatusOK)
	putUploadItem(t, server, job.ID, job.Tasks[1].ID, []byte("content"), http.StatusOK)
	putUploadItem(t, server, job.ID, job.Tasks[1].ID, []byte("content"), http.StatusConflict)
	final := getJSON[TaskResponse](t, server, "/api/tasks/"+job.ID)
	if final.Status != "completed" || final.MutationCount != 2 {
		t.Fatalf("unexpected upload completion: %#v", final)
	}
	uploadItems := getJSON[TaskItemPage](t, server, "/api/tasks/"+job.ID+"/items?pageSize=100")
	if uploadItems.TotalCount != 2 {
		t.Fatalf("unexpected upload task details: %#v", uploadItems)
	}
	var emptyDirectory, nestedFile TaskItem
	for _, item := range uploadItems.Items {
		switch item.SourcePath {
		case "empty":
			emptyDirectory = item
		case "nested/file.txt":
			nestedFile = item
		}
	}
	if emptyDirectory.Kind != "directory" || emptyDirectory.ParentID != nil || nestedFile.Kind != "file" || nestedFile.ParentID != nil {
		t.Fatalf("unexpected independent upload hierarchy: %#v", uploadItems.Items)
	}
	assertFileContent(t, filepath.Join(home, "uploads", "nested", "file.txt"), "content")
	if stat, err := os.Stat(filepath.Join(home, "uploads", "empty")); err != nil || !stat.IsDir() {
		t.Fatalf("empty directory was not uploaded: %v", err)
	}

	writeTestFile(t, filepath.Join(home, "uploads", "conflict.txt"), []byte("original"))
	blocked := postJSON[TaskResponse](t, server, "/api/tasks/uploads", "", `{
  "destination":{"tunnel":"personal","rootId":"home","path":"uploads"},
  "initiatedFrom":{"tunnel":"personal","rootId":"home","path":"uploads"},
  "conflictPolicy":"fail",
  "items":[{"relativePath":"conflict.txt","kind":"file","size":3}]
}`)
	if blocked.Status != "blocked" {
		t.Fatalf("expected blocked upload: %#v", blocked)
	}
	resolved := postJSON[TaskResponse](t, server, "/api/tasks/"+blocked.ID+"/resolve", "", `{"conflictPolicy":"keep-both"}`)
	if resolved.ID != blocked.ID || resolved.Status != "pending" || resolved.Tasks[0].TargetPath == nil || *resolved.Tasks[0].TargetPath == "uploads/conflict.txt" {
		t.Fatalf("unexpected resolved upload: %#v", resolved)
	}
	putUploadItem(t, server, blocked.ID, resolved.Tasks[0].ID, []byte("new"), http.StatusOK)
	assertFileContent(t, filepath.Join(home, filepath.FromSlash(*resolved.Tasks[0].TargetPath)), "new")

	unsafe := postRawJSON(t, server, "/api/tasks/uploads", `{
  "destination":{"tunnel":"personal","rootId":"home","path":"uploads"},
  "initiatedFrom":{"tunnel":"personal","rootId":"home","path":"uploads"},
  "conflictPolicy":"fail",
  "items":[{"relativePath":"../escape.txt","kind":"file","size":3}]
}`)
	if unsafe.Code != http.StatusBadRequest || !strings.Contains(unsafe.Body.String(), "invalid_upload_path") {
		t.Fatalf("unsafe manifest status=%d body=%s", unsafe.Code, unsafe.Body.String())
	}

	hierarchy := postJSON[TaskResponse](t, server, "/api/tasks/uploads", "", `{
  "destination":{"tunnel":"personal","rootId":"home","path":"uploads"},
  "initiatedFrom":{"tunnel":"personal","rootId":"home","path":"uploads"},
  "conflictPolicy":"fail",
  "items":[
    {"relativePath":"folder","kind":"directory"},
    {"relativePath":"folder/empty","kind":"directory"},
    {"relativePath":"folder/nested/file.txt","kind":"file","size":4}
  ]
}`)
	hierarchyPage := getJSON[TaskItemPage](t, server, "/api/tasks/"+hierarchy.ID+"/items?pageSize=100")
	byUploadPath := make(map[string]TaskItem, len(hierarchyPage.Items))
	for _, item := range hierarchyPage.Items {
		byUploadPath[item.SourcePath] = item
	}
	rootFolder := byUploadPath["folder"]
	for _, nestedPath := range []string{"folder/empty", "folder/nested/file.txt"} {
		item := byUploadPath[nestedPath]
		if item.ParentID == nil || *item.ParentID != rootFolder.ID || item.Depth != 1 {
			t.Fatalf("upload item %q lost its manifest hierarchy: %#v", nestedPath, item)
		}
	}

	cancelAfterMutation := postJSON[TaskResponse](t, server, "/api/tasks/uploads", "", `{
  "destination":{"tunnel":"personal","rootId":"home","path":"uploads"},
  "initiatedFrom":{"tunnel":"personal","rootId":"home","path":"uploads"},
  "conflictPolicy":"fail",
  "items":[
    {"relativePath":"partial/one.txt","kind":"file","size":3},
    {"relativePath":"partial/two.txt","kind":"file","size":3}
  ]
}`)
	putUploadItem(t, server, cancelAfterMutation.ID, cancelAfterMutation.Tasks[0].ID, []byte("one"), http.StatusOK)
	canceled := postJSON[TaskResponse](t, server, "/api/tasks/"+cancelAfterMutation.ID+"/cancel", "", `{}`)
	if canceled.Status != "canceled" || canceled.MutationCount != 1 {
		t.Fatalf("unexpected partially uploaded cancellation: %#v", canceled)
	}
	canceledItems := getJSON[TaskItemPage](t, server, "/api/tasks/"+cancelAfterMutation.ID+"/items?pageSize=100")
	states := map[string]string{}
	for _, item := range canceledItems.Items {
		states[item.SourcePath] = item.Status
	}
	if states["partial/one.txt"] != "completed" || states["partial/two.txt"] != "canceled" {
		t.Fatalf("unexpected canceled upload item states: %#v", states)
	}
}

func TestDownloadDisconnectMarksTaskError(t *testing.T) {
	server, home, _ := newTransferTestServer(t)
	writeTestFile(t, filepath.Join(home, "disconnect.bin"), bytes.Repeat([]byte("x"), 512*1024))
	task := postJSON[TaskResponse](t, server, "/api/tasks/downloads", "", `{"sources":[{"tunnel":"personal","rootId":"home","path":"disconnect.bin"}]}`)
	request := httptest.NewRequest(http.MethodGet, task.Download.URL, nil)
	response := &failingTaskResponseWriter{header: http.Header{}, remaining: 1024}
	server.Handler().ServeHTTP(response, request)
	final := getJSON[TaskResponse](t, server, "/api/tasks/"+task.ID)
	if final.Status != "error" {
		t.Fatalf("disconnected download status = %s message=%s", final.Status, final.Message)
	}
}

func TestTaskCancelAndRetentionLifecycle(t *testing.T) {
	server, home, _ := newTransferTestServer(t)
	writeTestFile(t, filepath.Join(home, "pending.txt"), []byte("pending"))
	job := postJSON[TaskResponse](t, server, "/api/tasks/downloads", "", `{"sources":[{"tunnel":"personal","rootId":"home","path":"pending.txt"}]}`)
	canceled := postJSON[TaskResponse](t, server, "/api/tasks/"+job.ID+"/cancel", "", `{}`)
	if canceled.Status != "canceled" {
		t.Fatalf("unexpected canceled task: %#v", canceled)
	}
	response := doTaskContentRequest(t, server, job.Download.URL, "")
	if response.Code != http.StatusConflict {
		t.Fatalf("canceled download status = %d body = %s", response.Code, response.Body.String())
	}

	server.tasks.mu.Lock()
	stored := server.tasks.jobs[job.ID]
	stored.job.UpdatedAt = time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339Nano)
	server.tasks.jobs[job.ID] = stored
	server.tasks.mu.Unlock()
	server.pruneTransferJobs("alice")
	if _, ok := server.transferJobForOwner(job.ID, "alice"); ok {
		t.Fatal("expired terminal task was not pruned")
	}
}

func TestTaskStateTransitionsRejectTerminalRestarts(t *testing.T) {
	if !validTaskStateTransition("pending", "running") || !validTaskStateTransition("blocked", "pending") || !validTaskStateTransition("running", "partial") {
		t.Fatal("expected lifecycle transition was rejected")
	}
	if validTaskStateTransition("completed", "running") || validTaskStateTransition("canceled", "pending") || validTaskStateTransition("blocked", "completed") {
		t.Fatal("invalid lifecycle transition was accepted")
	}
}

func waitTask(t *testing.T, server *Server, id string) TaskResponse {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		job := getJSON[TaskResponse](t, server, "/api/tasks/"+id)
		if terminalJobStatus(job.Status) || job.Status == "blocked" {
			return job
		}
		if time.Now().After(deadline) {
			t.Fatalf("task %s did not finish: %#v", id, job)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func doTaskContentRequest(t *testing.T, server *Server, url string, rangeHeader string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, url, nil)
	if rangeHeader != "" {
		request.Header.Set("Range", rangeHeader)
	}
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	return response
}

func putUploadItem(t *testing.T, server *Server, taskID string, itemID string, body []byte, expectedStatus int) UploadItemResponse {
	t.Helper()
	request := httptest.NewRequest(http.MethodPut, "/api/tasks/"+taskID+"/uploads/"+itemID, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/octet-stream")
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != expectedStatus {
		t.Fatalf("upload item status = %d body = %s", response.Code, response.Body.String())
	}
	var result UploadItemResponse
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	return result
}

func postRawJSON(t *testing.T, server *Server, path string, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	return response
}

type failingTaskResponseWriter struct {
	header    http.Header
	remaining int
	status    int
}

func (writer *failingTaskResponseWriter) Header() http.Header { return writer.header }

func (writer *failingTaskResponseWriter) WriteHeader(status int) { writer.status = status }

func (writer *failingTaskResponseWriter) Write(bytes []byte) (int, error) {
	if writer.remaining <= 0 {
		return 0, io.ErrClosedPipe
	}
	written := min(len(bytes), writer.remaining)
	writer.remaining -= written
	if written < len(bytes) {
		return written, io.ErrClosedPipe
	}
	return written, nil
}
