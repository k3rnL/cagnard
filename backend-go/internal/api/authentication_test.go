package api

import (
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
	"github.com/k3rnl/cagnard/backend-go/internal/identity"
	"github.com/k3rnl/cagnard/backend-go/internal/testconfig"
)

func authRequest(s *Server, method, url, body, cookie string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	prepareTestRequest(s, req)
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	return res
}
func TestPermissionMatrixAndReadBypasses(t *testing.T) {
	s, home, _ := newTransferTestServer(t)
	writeTestFile(t, filepath.Join(home, "test.txt"), []byte("hello"))
	s.cfg.Authorization.Roles[0].Actions = []string{identity.List}
	for _, url := range []string{
		"/api/storage/stat", "/api/storage/content", "/api/storage/preview", "/api/storage/content/search", "/api/storage/archive/entries", "/api/storage/archive/entry", "/api/storage/watch", "/api/storage/iceberg/probe",
	} {
		res := authRequest(s, "GET", url+"?tunnel=personal&rootId=home&path=test.txt", "", "")
		if res.Code != 403 {
			t.Fatalf("%s status=%d body=%s", url, res.Code, res.Body.String())
		}
	}
	if res := authRequest(s, "GET", "/api/storage/entries?tunnel=personal&rootId=home", "", ""); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	for _, test := range []struct{ action, method, url, body string }{
		{identity.Write, "PUT", "/api/storage/content?tunnel=personal&rootId=home&path=new.txt", "new"},
		{identity.Mkdir, "POST", "/api/storage/folders", `{"tunnel":"personal","rootId":"home","parentPath":"","name":"new"}`},
		{identity.Rename, "POST", "/api/storage/rename", `{"tunnel":"personal","rootId":"home","path":"test.txt","newName":"renamed.txt"}`},
		{identity.Delete, "POST", "/api/storage/delete", `{"tunnel":"personal","rootId":"home","path":"test.txt","confirmed":true}`},
	} {
		t.Run(test.action, func(t *testing.T) {
			s.cfg.Authorization.Roles[0].Actions = []string{identity.List, identity.Read}
			if res := authRequest(s, test.method, test.url, test.body, ""); res.Code != 403 {
				t.Fatalf("action without grant status=%d %s", res.Code, res.Body.String())
			}
			s.cfg.Authorization.Roles[0].Actions = append(s.cfg.Authorization.Roles[0].Actions, test.action)
			if res := authRequest(s, test.method, test.url, test.body, ""); res.Code != 200 {
				t.Fatalf("action with grant status=%d %s", res.Code, res.Body.String())
			}
			if test.action == identity.Rename {
				authRequest(s, "POST", "/api/storage/rename", `{"tunnel":"personal","rootId":"home","path":"renamed.txt","newName":"test.txt"}`, "")
			}
		})
	}
	s.cfg.Authorization.Roles[0].Actions = append([]string{}, identity.Actions...)
	s.cfg.Accounts[0].ReadOnly = true
	// The access service snapshots accounts on construction, as it does on restart.
	s = NewServer(s.cfg)
	if res := authRequest(s, "PUT", "/api/storage/content?tunnel=personal&rootId=home&path=blocked.txt", "x", ""); res.Code != 403 {
		t.Fatal("read-only ceiling bypassed")
	}
	s.cfg.Authorization.Bindings = nil
	if res := authRequest(s, "GET", "/api/storage/entries?tunnel=personal&rootId=home", "", ""); res.Code != 404 {
		t.Fatal("inaccessible root leaked")
	}
	session := getJSON[SessionResponse](t, s, "/api/session")
	if session.PersonalEnabled || session.GlobalEnabled {
		t.Fatal("zero-grant user received root")
	}
}
func TestOriginChecksAndNoBearerFallback(t *testing.T) {
	s, _, _ := newTransferTestServer(t)
	for _, headers := range []map[string]string{{}, {"Origin": "http://evil.test", "X-Cagnard-Request": "1"}, {"Origin": s.cfg.Auth.PublicURL}} {
		req := httptest.NewRequest("POST", "/api/auth/logout", nil)
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		res := httptest.NewRecorder()
		s.Handler().ServeHTTP(res, req)
		if res.Code != 403 {
			t.Fatal("CSRF request accepted")
		}
	}
	req := httptest.NewRequest("GET", "/api/session", nil)
	req.Header.Set("Authorization", "Bearer e30.e30.")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	if res.Code != 401 {
		t.Fatal("unsigned bearer accepted")
	}
	if res.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("permissive CORS remains")
	}
}
func TestTaskOwnerQualifiedAcrossStaticProviders(t *testing.T) {
	s, _, _ := newTransferTestServer(t)
	cfg := s.cfg
	cfg.Auth.Development = nil
	for _, id := range []string{"one", "two"} {
		cfg.Auth.Providers = append(cfg.Auth.Providers, config.AuthProviderConfig{ID: id, Type: "static", Enabled: true, Users: []config.ConfiguredUser{{ID: "alice", Enabled: true, Credential: &config.StaticUserCredentialConfig{Verifier: testconfig.Verifier}}}})
	}
	s = NewServer(cfg)
	cookies := []string{}
	for _, id := range []string{"one", "two"} {
		res := authRequest(s, "POST", "/api/auth/login", `{"providerId":"`+id+`","username":"alice","password":"cagnard"}`, "")
		if res.Code != 200 {
			t.Fatal(res.Body.String())
		}
		cookies = append(cookies, res.Header().Get("Set-Cookie"))
	}
	job := postJSON[TaskResponse](t, s, "/api/tasks/transfers", cookies[0], `{"sources":[],"destination":{"tunnel":"personal","rootId":"home","path":""},"conflictPolicy":"fail"}`)
	if res := authRequest(s, "GET", "/api/tasks/"+job.ID, "", cookies[1]); res.Code != 404 {
		t.Fatal("foreign provider task exposed")
	}
}
func TestFreshConflictContinuationAndBoundedEvidence(t *testing.T) {
	s, home, global := newTransferTestServer(t)
	s.cfg.Auth.Session.TTLSeconds = 1
	writeTestFile(t, filepath.Join(home, "a.txt"), []byte("new"))
	writeTestFile(t, filepath.Join(global, "a.txt"), []byte("old"))
	evidence := testIdentity(t, s)
	req := TransferRequest{Sources: []TransferSourceRequest{{Intent: "copy", Tunnel: "personal", RootID: "home", Path: "a.txt"}}, Destination: TransferDestinationRequest{Tunnel: "global", RootID: "shared"}, ConflictPolicy: "fail"}
	job, e := s.startTransferJobRequest(evidence, req)
	if e != nil || job.Status != "blocked" {
		t.Fatalf("not blocked %v", e)
	}
	ctx := s.taskContext(job.ID)
	select {
	case <-ctx.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("job has no authentication deadline")
	}
	if _, f := s.resolver.Resolve(evidence); f == nil {
		t.Fatal("expired job evidence accepted")
	}
	if _, e = s.resolveTransferJobRequest(evidence, job.ID, ResolveTransferJobRequest{ConflictPolicy: "replace"}); e == nil || e.Status != 401 {
		t.Fatal("expired continuation accepted")
	}
	fresh := testIdentity(t, s)
	if _, e = s.resolveTransferJobRequest(fresh, job.ID, ResolveTransferJobRequest{ConflictPolicy: "replace"}); e != nil {
		t.Fatal(e.Error)
	}
	final := waitTransferJob(t, s, job.ID)
	if final.Status != "completed" {
		t.Fatalf("fresh continuation failed %#v", final)
	}
	assertFileContent(t, filepath.Join(global, "a.txt"), "new")
}

func TestMutationTasksDoNotRequireUnrelatedReadGrant(t *testing.T) {
	s, home, _ := newTransferTestServer(t)
	s.cfg.Authorization.Roles[0].Actions = []string{identity.Write}
	job := postJSON[TaskResponse](t, s, "/api/tasks/uploads", "", `{"destination":{"tunnel":"personal","rootId":"home","path":""},"initiatedFrom":{"tunnel":"personal","rootId":"home","path":""},"items":[{"relativePath":"new.txt","kind":"file","size":3}]}`)
	res := authRequest(s, "PUT", "/api/tasks/"+job.ID+"/uploads/"+job.Tasks[0].ID, "new", "")
	if res.Code != 200 {
		t.Fatalf("write-only upload failed: %d %s", res.Code, res.Body.String())
	}
	assertFileContent(t, filepath.Join(home, "new.txt"), "new")
	s.cfg.Authorization.Roles[0].Actions = []string{identity.Delete}
	job = postJSON[TaskResponse](t, s, "/api/tasks/deletes", "", `{"confirmed":true,"initiatedFrom":{"tunnel":"personal","rootId":"home","path":""},"sources":[{"tunnel":"personal","rootId":"home","path":"new.txt"}]}`)
	if final := waitTransferJob(t, s, job.ID); final.Status != "completed" {
		t.Fatalf("delete-only task failed: %#v", final)
	}
}
