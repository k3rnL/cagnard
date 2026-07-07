package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

func TestHealthAndDiscoveryRoutes(t *testing.T) {
	cfg, err := config.Load(filepath.Join("..", "..", "..", "config", "cagnard.example.conf"))
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(cfg)

	health := getJSON[HealthResponse](t, server, "/api/health")
	if health.Status != "ok" || !health.Stateless || health.Providers != 1 || health.ConfiguredUsers != 1 {
		t.Fatalf("unexpected health response: %#v", health)
	}

	auth := getJSON[AuthProvidersResponse](t, server, "/api/auth/providers")
	if len(auth.Providers) != 1 || auth.Providers[0].ID != "static" {
		t.Fatalf("unexpected auth providers: %#v", auth)
	}
	if auth.Providers[0].LoginURL == nil || *auth.Providers[0].LoginURL != "/api/auth/login" || auth.Providers[0].Capabilities[0] != "password-login" {
		t.Fatalf("unexpected auth provider metadata: %#v", auth.Providers[0])
	}

	unauthorized := getAPIError(t, server, "/api/storage/navigation", "")
	if unauthorized.Code != "unauthorized" {
		t.Fatalf("unexpected unauthorized response: %#v", unauthorized)
	}

	cookie := loginCookie(t, server, "alice", "cagnard")
	session := getJSONWithCookie[SessionResponse](t, server, "/api/session", cookie)
	if session.User.ID != "alice" || session.AuthMode != "static" || !session.PersonalEnabled || !session.GlobalEnabled {
		t.Fatalf("unexpected session: %#v", session)
	}

	nav := getJSONWithCookie[NavigationResponse](t, server, "/api/storage/navigation", cookie)
	if nav.Personal == nil || len(nav.Personal.Roots) != 1 || nav.Personal.Roots[0].Label != "Home" || nav.Personal.Roots[0].Tunnel != "personal" {
		t.Fatalf("unexpected navigation: %#v", nav)
	}
	if nav.Global == nil || len(nav.Global.Roots) != 1 || nav.Global.Roots[0].Label != "Global" {
		t.Fatalf("unexpected global navigation: %#v", nav)
	}

	plugins := getJSONWithCookie[UIPluginsResponse](t, server, "/api/plugins/ui", cookie)
	if len(plugins.Plugins) != 1 || plugins.Plugins[0].ID != "text-preview" {
		t.Fatalf("unexpected ui plugins: %#v", plugins)
	}

	jobs := getJSONWithCookie[TransferJobListResponse](t, server, "/api/storage/transfer/jobs", cookie)
	if len(jobs.Jobs) != 0 {
		t.Fatalf("unexpected transfer jobs: %#v", jobs)
	}

	emptyJob := postJSON[TransferJobResponse](t, server, "/api/storage/transfer/jobs", cookie, `{"sources":[],"destination":{"tunnel":"personal","rootId":"home","path":""},"conflictPolicy":"fail"}`)
	if emptyJob.Status != "error" || emptyJob.Message != "No entries selected for transfer" {
		t.Fatalf("unexpected empty transfer job response: %#v", emptyJob)
	}

	missingJob := getAPIErrorWithStatus(t, server, "/api/storage/transfer/jobs/missing", cookie, http.StatusNotFound)
	if missingJob.Code != "not_found" {
		t.Fatalf("unexpected missing job error: %#v", missingJob)
	}
}

func TestDevelopmentSessionCompatibility(t *testing.T) {
	cfg, err := config.Load(filepath.Join("..", "..", "..", "config", "cagnard.example.conf"))
	if err != nil {
		t.Fatal(err)
	}
	mode := "development"
	defaultUser := "alice"
	cfg.Auth.Mode = &mode
	cfg.Auth.DefaultUser = &defaultUser
	server := NewServer(cfg)

	session := getJSON[SessionResponse](t, server, "/api/session")
	if session.User.ID != "alice" || session.AuthMode != "configured-user" {
		t.Fatalf("unexpected default development session: %#v", session)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/session", nil)
	request.Header.Set("X-Cagnard-User", "alice")
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("header session status = %d body = %s", response.Code, response.Body.String())
	}
}

func TestStorageRouteCompatibility(t *testing.T) {
	server, home, global := newTransferTestServer(t)
	writeTestFile(t, filepath.Join(home, "docs", "hello.txt"), []byte("hello"))

	entries := getJSON[EntryListResponse](t, server, "/api/storage/entries?tunnel=personal&rootId=home&path=docs")
	if len(entries.Entries) != 1 || entries.Entries[0].Name != "hello.txt" || entries.Entries[0].Kind != "file" {
		t.Fatalf("unexpected entries response: %#v", entries)
	}

	stat := getJSON[StorageEntry](t, server, "/api/storage/stat?tunnel=personal&rootId=home&path=docs/hello.txt")
	if stat.Name != "hello.txt" || stat.Metadata.Size == nil || *stat.Metadata.Size != 5 {
		t.Fatalf("unexpected stat response: %#v", stat)
	}

	preview := getJSON[PreviewResponse](t, server, "/api/storage/preview?tunnel=personal&rootId=home&path=docs/hello.txt")
	if preview.Content != "hello" || preview.MIMEType == nil {
		t.Fatalf("unexpected preview response: %#v", preview)
	}

	uploaded := putContent[OperationResponse](t, server, "/api/storage/content?tunnel=global&rootId=shared&path=uploaded.txt&overwrite=true", []byte("uploaded"))
	if !uploaded.Success || uploaded.Entry == nil || uploaded.Entry.Path != "uploaded.txt" {
		t.Fatalf("unexpected upload response: %#v", uploaded)
	}
	if string(readContent(t, server, "/api/storage/content?tunnel=global&rootId=shared&path=uploaded.txt")) != "uploaded" {
		t.Fatalf("unexpected downloaded content")
	}

	folder := postJSON[OperationResponse](t, server, "/api/storage/folders", "", `{"tunnel":"global","rootId":"shared","parentPath":"","name":"actions"}`)
	if !folder.Success || folder.Entry == nil || folder.Entry.Path != "actions" {
		t.Fatalf("unexpected create folder response: %#v", folder)
	}

	writeTestFile(t, filepath.Join(global, "rename-me.txt"), []byte("rename"))
	renamed := postJSON[OperationResponse](t, server, "/api/storage/rename", "", `{"tunnel":"global","rootId":"shared","path":"rename-me.txt","newName":"renamed.txt"}`)
	if !renamed.Success || renamed.Entry == nil || renamed.Entry.Path != "renamed.txt" {
		t.Fatalf("unexpected rename response: %#v", renamed)
	}

	deleted := postJSON[OperationResponse](t, server, "/api/storage/delete", "", `{"tunnel":"global","rootId":"shared","path":"actions","confirmed":true}`)
	if !deleted.Success {
		t.Fatalf("unexpected delete response: %#v", deleted)
	}
	if _, err := os.Stat(filepath.Join(global, "actions")); !os.IsNotExist(err) {
		t.Fatalf("expected actions folder to be deleted, stat err = %v", err)
	}
}

func TestStorageEntriesPaginationSearchAndSort(t *testing.T) {
	server, home, _ := newTransferTestServer(t)
	writeTestFile(t, filepath.Join(home, "docs", "beta.txt"), []byte("bb"))
	writeTestFile(t, filepath.Join(home, "docs", "alpha.md"), []byte("aaaa"))
	writeTestFile(t, filepath.Join(home, "docs", "gamma.json"), []byte("{}"))

	first := getJSON[EntryListResponse](t, server, "/api/storage/entries?tunnel=personal&rootId=home&path=docs&pageSize=2&sortKey=size&sortDirection=desc")
	if len(first.Entries) != 2 || first.Entries[0].Name != "alpha.md" || first.Entries[1].Name != "beta.txt" {
		t.Fatalf("unexpected first page: %#v", first)
	}
	if first.Page.NextPageRef == nil || !first.Page.HasMore || first.Page.FilteredCount == nil || *first.Page.FilteredCount != 3 {
		t.Fatalf("unexpected page metadata: %#v", first.Page)
	}

	second := getJSON[EntryListResponse](t, server, "/api/storage/entries?tunnel=personal&rootId=home&path=docs&pageSize=2&sortKey=size&sortDirection=desc&pageRef="+*first.Page.NextPageRef)
	if len(second.Entries) != 1 || second.Entries[0].Name != "gamma.json" || second.Page.HasMore {
		t.Fatalf("unexpected second page: %#v", second)
	}

	filtered := getJSON[EntryListResponse](t, server, "/api/storage/entries?tunnel=personal&rootId=home&path=docs&query=json&pageSize=10")
	if len(filtered.Entries) != 1 || filtered.Entries[0].Name != "gamma.json" || filtered.Page.FilteredCount == nil || *filtered.Page.FilteredCount != 1 {
		t.Fatalf("unexpected filtered page: %#v", filtered)
	}

	errResponse := getAPIErrorWithStatus(t, server, "/api/storage/entries?tunnel=personal&rootId=home&path=docs&pageRef=bad", "", http.StatusBadRequest)
	if errResponse.Code != "invalid_page_ref" {
		t.Fatalf("unexpected invalid page ref error: %#v", errResponse)
	}
}

func TestTransferRoutes(t *testing.T) {
	server, home, global := newTransferTestServer(t)
	writeTestFile(t, filepath.Join(home, "docs", "hello.txt"), []byte("hello"))

	copyResponse := postJSON[TransferResponse](t, server, "/api/storage/transfer", "", `{"sources":[{"intent":"copy","tunnel":"personal","rootId":"home","path":"docs/hello.txt"}],"destination":{"tunnel":"global","rootId":"shared","path":"incoming"},"conflictPolicy":"fail"}`)
	if !copyResponse.Success || len(copyResponse.Results) != 1 || copyResponse.Results[0].Status != "copied" {
		t.Fatalf("unexpected copy response: %#v", copyResponse)
	}
	assertFileContent(t, filepath.Join(global, "incoming", "hello.txt"), "hello")

	writeTestFile(t, filepath.Join(home, "docs", "conflict.txt"), []byte("new"))
	writeTestFile(t, filepath.Join(global, "incoming", "conflict.txt"), []byte("old"))
	conflictResponse := postJSON[TransferResponse](t, server, "/api/storage/transfer", "", `{"sources":[{"intent":"copy","tunnel":"personal","rootId":"home","path":"docs/conflict.txt"}],"destination":{"tunnel":"global","rootId":"shared","path":"incoming"},"conflictPolicy":"fail"}`)
	if conflictResponse.Success || len(conflictResponse.Results) != 1 || conflictResponse.Results[0].Status != "conflict" {
		t.Fatalf("unexpected conflict response: %#v", conflictResponse)
	}

	keepBothResponse := postJSON[TransferResponse](t, server, "/api/storage/transfer", "", `{"sources":[{"intent":"copy","tunnel":"personal","rootId":"home","path":"docs/conflict.txt"}],"destination":{"tunnel":"global","rootId":"shared","path":"incoming"},"conflictPolicy":"keep-both"}`)
	if !keepBothResponse.Success || keepBothResponse.Results[0].TargetPath == nil || *keepBothResponse.Results[0].TargetPath != "incoming/conflict copy.txt" {
		t.Fatalf("unexpected keep-both response: %#v", keepBothResponse)
	}
	assertFileContent(t, filepath.Join(global, "incoming", "conflict copy.txt"), "new")

	writeTestFile(t, filepath.Join(home, "docs", "move.txt"), []byte("move"))
	moveResponse := postJSON[TransferResponse](t, server, "/api/storage/transfer", "", `{"sources":[{"intent":"move","tunnel":"personal","rootId":"home","path":"docs/move.txt"}],"destination":{"tunnel":"global","rootId":"shared","path":"incoming"},"conflictPolicy":"fail"}`)
	if !moveResponse.Success || moveResponse.Results[0].Status != "moved" {
		t.Fatalf("unexpected move response: %#v", moveResponse)
	}
	if _, err := os.Stat(filepath.Join(home, "docs", "move.txt")); !os.IsNotExist(err) {
		t.Fatalf("expected move source to be deleted, stat err = %v", err)
	}
	assertFileContent(t, filepath.Join(global, "incoming", "move.txt"), "move")

	writeTestFile(t, filepath.Join(home, "tree", "child", "note.txt"), []byte("tree"))
	directoryResponse := postJSON[TransferResponse](t, server, "/api/storage/transfer", "", `{"sources":[{"intent":"copy","tunnel":"personal","rootId":"home","path":"tree"}],"destination":{"tunnel":"global","rootId":"shared","path":"dirs"},"conflictPolicy":"fail"}`)
	if !directoryResponse.Success || directoryResponse.Results[0].Status != "copied" || len(directoryResponse.Results[0].Children) != 1 {
		t.Fatalf("unexpected directory copy response: %#v", directoryResponse)
	}
	assertFileContent(t, filepath.Join(global, "dirs", "tree", "child", "note.txt"), "tree")

	writeTestFile(t, filepath.Join(home, "docs", "job.txt"), []byte("job-content"))
	job := postJSON[TransferJobResponse](t, server, "/api/storage/transfer/jobs", "", `{"sources":[{"intent":"copy","tunnel":"personal","rootId":"home","path":"docs/job.txt"}],"destination":{"tunnel":"global","rootId":"shared","path":"jobs"},"conflictPolicy":"fail"}`)
	if job.ID == "" || len(job.Tasks) != 1 {
		t.Fatalf("unexpected transfer job response: %#v", job)
	}
	finalJob := waitTransferJob(t, server, job.ID)
	if finalJob.Status != "completed" || len(finalJob.Results) != 1 || finalJob.Results[0].Status != "copied" {
		t.Fatalf("unexpected final transfer job: %#v", finalJob)
	}
	if finalJob.Tasks[0].Progress.BytesTransferred != int64(len("job-content")) || finalJob.Tasks[0].Progress.TotalBytes == nil || *finalJob.Tasks[0].Progress.TotalBytes != int64(len("job-content")) {
		t.Fatalf("unexpected transfer progress: %#v", finalJob.Tasks[0].Progress)
	}
	assertFileContent(t, filepath.Join(global, "jobs", "job.txt"), "job-content")

	writeTestFile(t, filepath.Join(home, "docs", "same-root.txt"), []byte("same-root"))
	sameRootJob := postJSON[TransferJobResponse](t, server, "/api/storage/transfer/jobs", "", `{"sources":[{"intent":"copy","tunnel":"personal","rootId":"home","path":"docs/same-root.txt"}],"destination":{"tunnel":"personal","rootId":"home","path":"copies"},"conflictPolicy":"fail"}`)
	finalSameRootJob := waitTransferJob(t, server, sameRootJob.ID)
	if finalSameRootJob.Status != "completed" || len(finalSameRootJob.Tasks) != 1 {
		t.Fatalf("unexpected same-root transfer job: %#v", finalSameRootJob)
	}
	if finalSameRootJob.Tasks[0].Progress.ItemsCompleted != 1 || finalSameRootJob.Tasks[0].Progress.BytesTransferred != int64(len("same-root")) || finalSameRootJob.Tasks[0].Progress.TotalBytes == nil || *finalSameRootJob.Tasks[0].Progress.TotalBytes != int64(len("same-root")) {
		t.Fatalf("unexpected same-root transfer progress: %#v", finalSameRootJob.Tasks[0].Progress)
	}
	assertFileContent(t, filepath.Join(home, "copies", "same-root.txt"), "same-root")

	writeTestFile(t, filepath.Join(home, "job-tree", "child", "note.txt"), []byte("job-tree"))
	folderJob := postJSON[TransferJobResponse](t, server, "/api/storage/transfer/jobs", "", `{"sources":[{"intent":"copy","tunnel":"personal","rootId":"home","path":"job-tree"}],"destination":{"tunnel":"global","rootId":"shared","path":"jobs"},"conflictPolicy":"fail"}`)
	finalFolderJob := waitTransferJob(t, server, folderJob.ID)
	if finalFolderJob.Status != "completed" || len(finalFolderJob.Tasks) != 1 || len(finalFolderJob.Tasks[0].Children) != 1 {
		t.Fatalf("unexpected folder transfer task: %#v", finalFolderJob)
	}
	childDir := finalFolderJob.Tasks[0].Children[0]
	if len(childDir.Children) != 1 || childDir.Children[0].SourcePath != "job-tree/child/note.txt" {
		t.Fatalf("expected nested child file task, got: %#v", childDir)
	}
	if finalFolderJob.Tasks[0].Progress.BytesTransferred != int64(len("job-tree")) || finalFolderJob.Tasks[0].Progress.TotalBytes == nil || *finalFolderJob.Tasks[0].Progress.TotalBytes != int64(len("job-tree")) {
		t.Fatalf("unexpected folder aggregate progress: %#v", finalFolderJob.Tasks[0].Progress)
	}
	assertFileContent(t, filepath.Join(global, "jobs", "job-tree", "child", "note.txt"), "job-tree")

	writeTestFile(t, filepath.Join(home, "docs", "job-conflict.txt"), []byte("new"))
	writeTestFile(t, filepath.Join(global, "jobs", "job-conflict.txt"), []byte("old"))
	blockedJob := postJSON[TransferJobResponse](t, server, "/api/storage/transfer/jobs", "", `{"sources":[{"intent":"copy","tunnel":"personal","rootId":"home","path":"docs/job-conflict.txt"}],"destination":{"tunnel":"global","rootId":"shared","path":"jobs"},"conflictPolicy":"fail"}`)
	if blockedJob.Status != "blocked" || blockedJob.ID == "" {
		t.Fatalf("unexpected blocked transfer job: %#v", blockedJob)
	}
	resolvedJob := postJSON[TransferJobResponse](t, server, "/api/storage/transfer/jobs/"+blockedJob.ID+"/resolve", "", `{"conflictPolicy":"keep-both"}`)
	if resolvedJob.ID != blockedJob.ID || resolvedJob.Status != "pending" {
		t.Fatalf("expected conflict resolution to reuse task id, got: %#v", resolvedJob)
	}
	finalResolvedJob := waitTransferJob(t, server, blockedJob.ID)
	if finalResolvedJob.Status != "completed" || len(finalResolvedJob.Results) != 1 || finalResolvedJob.Results[0].TargetPath == nil || *finalResolvedJob.Results[0].TargetPath != "jobs/job-conflict copy.txt" {
		t.Fatalf("unexpected resolved transfer job: %#v", finalResolvedJob)
	}
	assertFileContent(t, filepath.Join(global, "jobs", "job-conflict copy.txt"), "new")

	jobs := getJSON[TransferJobListResponse](t, server, "/api/storage/transfer/jobs")
	if !transferJobListContains(jobs, job.ID) || !transferJobListContains(jobs, sameRootJob.ID) || !transferJobListContains(jobs, blockedJob.ID) {
		t.Fatalf("unexpected transfer job list: %#v", jobs)
	}

	clearResponse := postJSON[OperationResponse](t, server, "/api/storage/transfer/jobs/clear", "", `{}`)
	if !clearResponse.Success {
		t.Fatalf("unexpected transfer clear response: %#v", clearResponse)
	}
	clearedJobs := getJSON[TransferJobListResponse](t, server, "/api/storage/transfer/jobs")
	if len(clearedJobs.Jobs) != 0 {
		t.Fatalf("expected cleared transfer jobs, got: %#v", clearedJobs)
	}

	missingCancel := postJSONError(t, server, "/api/storage/transfer/jobs/missing/cancel", "", `{}`, http.StatusNotFound)
	if missingCancel.Code != "not_found" {
		t.Fatalf("unexpected missing cancel response: %#v", missingCancel)
	}
}

func getJSON[T any](t *testing.T, server *Server, path string) T {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	return doJSON[T](t, server, request)
}

func getJSONWithCookie[T any](t *testing.T, server *Server, path string, cookie string) T {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.Header.Set("Cookie", cookie)
	return doJSON[T](t, server, request)
}

func doJSON[T any](t *testing.T, server *Server, request *http.Request) T {
	t.Helper()
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("%s status = %d body = %s", request.URL.Path, response.Code, response.Body.String())
	}
	var out T
	if err := json.NewDecoder(response.Body).Decode(&out); err != nil {
		t.Fatalf("decode %s: %v", request.URL.Path, err)
	}
	return out
}

func postJSON[T any](t *testing.T, server *Server, path string, cookie string, body string) T {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader([]byte(body)))
	request.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		request.Header.Set("Cookie", cookie)
	}
	return doJSON[T](t, server, request)
}

func putContent[T any](t *testing.T, server *Server, path string, body []byte) T {
	t.Helper()
	request := httptest.NewRequest(http.MethodPut, path, bytes.NewReader(body))
	return doJSON[T](t, server, request)
}

func readContent(t *testing.T, server *Server, path string) []byte {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("%s status = %d body = %s", path, response.Code, response.Body.String())
	}
	return response.Body.Bytes()
}

func loginCookie(t *testing.T, server *Server, username string, password string) string {
	t.Helper()
	body := []byte(`{"providerId":"static","username":"` + username + `","password":"` + password + `"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("login status = %d body = %s", response.Code, response.Body.String())
	}
	setCookie := response.Header().Get("Set-Cookie")
	if !strings.Contains(setCookie, "HttpOnly") || !strings.Contains(setCookie, "SameSite=Lax") {
		t.Fatalf("unexpected set-cookie: %s", setCookie)
	}
	return cookiePair(setCookie)
}

func cookiePair(setCookie string) string {
	pair, _, _ := strings.Cut(setCookie, ";")
	return pair
}

func getAPIError(t *testing.T, server *Server, path string, cookie string) APIError {
	return getAPIErrorWithStatus(t, server, path, cookie, http.StatusUnauthorized)
}

func getAPIErrorWithStatus(t *testing.T, server *Server, path string, cookie string, status int) APIError {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	if cookie != "" {
		request.Header.Set("Cookie", cookie)
	}
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != status {
		t.Fatalf("%s status = %d body = %s", path, response.Code, response.Body.String())
	}
	var out APIError
	if err := json.NewDecoder(response.Body).Decode(&out); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	return out
}

func newTransferTestServer(t *testing.T) (*Server, string, string) {
	t.Helper()
	base := t.TempDir()
	home := filepath.Join(base, "home", "alice")
	global := filepath.Join(base, "global")
	if err := os.MkdirAll(home, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(global, 0o755); err != nil {
		t.Fatal(err)
	}
	mode := "development"
	defaultUser := "alice"
	homeLabel := "Home"
	globalLabel := "Shared"
	cfg := &config.CagnardConfig{
		Server: config.ServerConfig{Host: "127.0.0.1", Port: 0},
		Auth: config.AuthConfig{
			Mode:                   &mode,
			ConfiguredUsersEnabled: true,
			DefaultUser:            &defaultUser,
		},
		Users: []config.ConfiguredUser{
			{ID: "alice", DisplayName: "Alice", Roles: []string{"user"}, Groups: []string{}, Claims: map[string]string{}},
		},
		Providers: []config.ProviderConfig{
			{ID: "unix", Type: "filesystem", Family: "filesystem", DisplayName: "Unix filesystem", Settings: map[string]string{}},
		},
		Accounts: []config.StorageAccountConfig{
			{ID: "local", ProviderID: "unix", DisplayName: "Local", Enabled: true, ReadOnly: false, AuthMode: "none", Settings: map[string]string{}},
		},
		PersonalStorage: []config.StorageRootConfig{
			{ID: "home", Label: &homeLabel, ProviderID: "unix", AccountID: "local", Path: &home, Settings: map[string]string{}},
		},
		GlobalStorage: []config.StorageRootConfig{
			{ID: "shared", Label: &globalLabel, ProviderID: "unix", AccountID: "local", Path: &global, Settings: map[string]string{}, AllowedRoles: []string{"user"}},
		},
	}
	return NewServer(cfg), home, global
}

func writeTestFile(t *testing.T, path string, content []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatal(err)
	}
}

func assertFileContent(t *testing.T, path string, expected string) {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != expected {
		t.Fatalf("%s content = %q, want %q", path, string(content), expected)
	}
}

func waitTransferJob(t *testing.T, server *Server, id string) TransferJobResponse {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		job := getJSON[TransferJobResponse](t, server, "/api/storage/transfer/jobs/"+id)
		switch job.Status {
		case "completed", "error", "failed", "canceled", "partial", "blocked":
			return job
		}
		if time.Now().After(deadline) {
			t.Fatalf("transfer job %s did not finish, last response: %#v", id, job)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func transferJobListContains(jobs TransferJobListResponse, id string) bool {
	for _, job := range jobs.Jobs {
		if job.ID == id {
			return true
		}
	}
	return false
}

func postJSONError(t *testing.T, server *Server, path string, cookie string, body string, status int) APIError {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader([]byte(body)))
	request.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		request.Header.Set("Cookie", cookie)
	}
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != status {
		t.Fatalf("%s status = %d body = %s", path, response.Code, response.Body.String())
	}
	var out APIError
	if err := json.NewDecoder(response.Body).Decode(&out); err != nil {
		t.Fatalf("decode post error response: %v", err)
	}
	return out
}
