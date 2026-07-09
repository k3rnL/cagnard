package storage

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

func TestS3RegistryAndRootResolution(t *testing.T) {
	cfg := s3TestConfig(nil, "")
	registry := NewRegistry(cfg)
	provider, err := registry.Provider("s3-main")
	if err != nil {
		t.Fatal(err)
	}
	if provider.Descriptor().Family != "s3" {
		t.Fatalf("provider family = %q", provider.Descriptor().Family)
	}
}

func TestS3CustomRootLabelAndPrefix(t *testing.T) {
	label := "Documents"
	cfg := s3TestConfig(&label, "team/docs")
	if cfg.PersonalStorage[0].Label == nil || *cfg.PersonalStorage[0].Label != "Documents" || cfg.PersonalStorage[0].Settings["prefix"] != "team/docs" {
		t.Fatalf("storage root = %#v", cfg.PersonalStorage[0])
	}
}

func TestS3ProviderRejectsUnsafePaths(t *testing.T) {
	fake := newFakeS3ObjectClient(nil)
	provider := testS3Provider(fake, 64)
	if _, err := provider.Upload(s3Root(""), "../escape.txt", []byte("bad"), false); err == nil {
		t.Fatal("expected unsafe path to fail")
	}
	if len(fake.keys()) != 0 {
		t.Fatalf("unexpected keys: %#v", fake.keys())
	}
}

func TestS3ListPrefixesAndStatImplicitDirectories(t *testing.T) {
	fake := newFakeS3ObjectClient(map[string]fakeS3Object{
		"team/docs/readme.txt":         fakeObject("team/docs/readme.txt", []byte("hello"), ptr("text/plain")),
		"team/docs/folder/":            fakeObject("team/docs/folder/", []byte{}, ptr("application/x-directory")),
		"team/docs/folder/note.txt":    fakeObject("team/docs/folder/note.txt", []byte("note"), ptr("text/plain")),
		"team/docs/folder/nested/a.md": fakeObject("team/docs/folder/nested/a.md", []byte("nested"), ptr("text/markdown")),
	})
	provider := testS3Provider(fake, defaultMaxBufferedObjectBytes)
	root := s3Root("team/docs")

	entries, err := provider.List(root, "")
	if err != nil {
		t.Fatal(err)
	}
	got := make([]string, 0, len(entries))
	for _, entry := range entries {
		got = append(got, entry.Name+":"+entry.Kind)
	}
	if strings.Join(got, ",") != "folder:directory,readme.txt:file" {
		t.Fatalf("entries = %#v", got)
	}
	if entries[0].Capabilities[len(entries[0].Capabilities)-1].Name != "delete" {
		t.Fatalf("directory capabilities missing delete: %#v", entries[0].Capabilities)
	}

	folder, err := provider.Stat(root, "folder/nested")
	if err != nil {
		t.Fatal(err)
	}
	if folder.Kind != "directory" || folder.Path != "folder/nested" {
		t.Fatalf("folder stat = %#v", folder)
	}
}

func TestS3MetadataLimitAndMutations(t *testing.T) {
	fake := newFakeS3ObjectClient(map[string]fakeS3Object{
		"team/docs/source.txt": fakeObject("team/docs/source.txt", []byte("hello"), ptr("text/plain")),
	})
	provider := testS3Provider(fake, 64)
	root := s3Root("team/docs")

	entry, err := provider.Stat(root, "source.txt")
	if err != nil {
		t.Fatal(err)
	}
	if entry.Metadata.Size == nil || *entry.Metadata.Size != 5 || entry.ProviderSpecific["s3.key"] != "team/docs/source.txt" {
		t.Fatalf("entry = %#v", entry)
	}

	if _, err := provider.Upload(root, "too-large.txt", []byte(strings.Repeat("x", 65)), false); err == nil || err.Error() != "Object exceeds buffered object limit of 64 bytes" {
		t.Fatalf("expected buffered limit, got %v", err)
	}

	if _, err := provider.Copy(root, "source.txt", "copy.txt", false); err != nil {
		t.Fatal(err)
	}
	if !fake.has("team/docs/source.txt") || !fake.has("team/docs/copy.txt") {
		t.Fatalf("copy keys = %#v", fake.keys())
	}
	if _, err := provider.Move(root, "copy.txt", "moved.txt", false); err != nil {
		t.Fatal(err)
	}
	if fake.has("team/docs/copy.txt") || !fake.has("team/docs/moved.txt") {
		t.Fatalf("move keys = %#v", fake.keys())
	}
	if _, err := provider.Rename(root, "moved.txt", "renamed.txt"); err != nil {
		t.Fatal(err)
	}
	if fake.has("team/docs/moved.txt") || !fake.has("team/docs/renamed.txt") {
		t.Fatalf("rename keys = %#v", fake.keys())
	}
	if err := provider.Delete(root, "renamed.txt"); err != nil {
		t.Fatal(err)
	}
	if fake.has("team/docs/renamed.txt") {
		t.Fatalf("delete keys = %#v", fake.keys())
	}
}

func TestS3PreviewPagination(t *testing.T) {
	fake := newFakeS3ObjectClient(map[string]fakeS3Object{
		"team/docs/big.txt": fakeObject("team/docs/big.txt", []byte("0123456789"), ptr("text/plain")),
	})
	provider := testS3Provider(fake, 4)
	root := s3Root("team/docs")

	first, err := provider.Preview(root, "big.txt", 0, 4)
	if err != nil {
		t.Fatal(err)
	}
	if first.Content != "0123" || !first.Truncated || first.NextOffset != 4 {
		t.Fatalf("first page = %#v", first)
	}

	second, err := provider.Preview(root, "big.txt", first.NextOffset, 4)
	if err != nil {
		t.Fatal(err)
	}
	if second.Content != "4567" || !second.Truncated {
		t.Fatalf("second page = %#v", second)
	}

	last, err := provider.Preview(root, "big.txt", second.NextOffset, 4)
	if err != nil {
		t.Fatal(err)
	}
	if last.Content != "89" || last.Truncated || last.NextOffset != 10 {
		t.Fatalf("last page = %#v", last)
	}
}

func TestS3Watch(t *testing.T) {
	previousInterval := s3WatchPollInterval
	s3WatchPollInterval = 10 * time.Millisecond
	defer func() { s3WatchPollInterval = previousInterval }()

	fake := newFakeS3ObjectClient(map[string]fakeS3Object{
		"team/docs/app.log": fakeObject("team/docs/app.log", []byte("one\n"), ptr("text/plain")),
	})
	provider := testS3Provider(fake, defaultMaxBufferedObjectBytes)
	root := s3Root("team/docs")

	cancel := make(chan struct{})
	defer close(cancel)
	events, err := provider.Watch(root, "app.log", cancel)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := fake.Put("bucket", "team/docs/app.log", []byte("one\ntwo\n"), ptr("text/plain")); err != nil {
		t.Fatal(err)
	}
	appended := nextWatchEvent(t, events)
	if appended.Kind != WatchEventAppended || appended.Offset != 4 || appended.Length != 4 {
		t.Fatalf("appended event = %#v", appended)
	}

	if err := fake.Delete("bucket", "team/docs/app.log"); err != nil {
		t.Fatal(err)
	}
	removed := nextWatchEvent(t, events)
	if removed.Kind != WatchEventRemoved {
		t.Fatalf("removed event = %#v", removed)
	}
}

func TestS3RangeRead(t *testing.T) {
	fake := newFakeS3ObjectClient(map[string]fakeS3Object{
		"team/docs/clip.bin": fakeObject("team/docs/clip.bin", []byte("0123456789"), ptr("application/octet-stream")),
	})
	provider := testS3Provider(fake, 4)
	root := s3Root("team/docs")

	reader, info, err := provider.RangeRead(root, "clip.bin", 2, 4)
	if err != nil {
		t.Fatal(err)
	}
	middle, err := io.ReadAll(reader)
	_ = reader.Close()
	if err != nil || string(middle) != "2345" {
		t.Fatalf("mid-range read = %q err = %v", middle, err)
	}
	if info.Size == nil || *info.Size != 10 {
		t.Fatalf("range info should report total size: %#v", info)
	}

	reader, _, err = provider.RangeRead(root, "clip.bin", 4, -1)
	if err != nil {
		t.Fatal(err)
	}
	tail, err := io.ReadAll(reader)
	_ = reader.Close()
	if err != nil || string(tail) != "456789" {
		t.Fatalf("open-ended read = %q err = %v", tail, err)
	}

	if _, _, err := provider.RangeRead(root, "clip.bin", 10, 1); err == nil {
		t.Fatal("expected out-of-range offset to fail")
	}
	if _, _, err := provider.RangeRead(root, "missing.bin", 0, 1); err == nil {
		t.Fatal("expected missing object to fail")
	}
}

func TestS3StreamsReadAndWriteWithProgress(t *testing.T) {
	fake := newFakeS3ObjectClient(map[string]fakeS3Object{
		"team/docs/source.bin": fakeObject("team/docs/source.bin", []byte(strings.Repeat("x", 128)), ptr("application/octet-stream")),
	})
	provider := testS3Provider(fake, 64)
	root := s3Root("team/docs")

	var read bytes.Buffer
	readProgress := int64(0)
	info, err := provider.StreamRead(root, "source.bin", &read, func(delta int64) {
		readProgress += delta
	})
	if err != nil {
		t.Fatal(err)
	}
	if read.Len() != 128 || readProgress != 128 || info.Size == nil || *info.Size != 128 {
		t.Fatalf("unexpected stream read: len=%d progress=%d info=%#v", read.Len(), readProgress, info)
	}

	writeProgress := int64(0)
	entry, err := provider.StreamWrite(root, "target.bin", strings.NewReader(strings.Repeat("y", 96)), FileContentInfo{FileName: "target.bin", MIMEType: ptr("application/octet-stream"), Size: int64Ptr(96)}, false, func(delta int64) {
		writeProgress += delta
	})
	if err != nil {
		t.Fatal(err)
	}
	if !fake.has("team/docs/target.bin") || writeProgress != 96 || entry.Metadata.Size == nil || *entry.Metadata.Size != 96 {
		t.Fatalf("unexpected stream write: progress=%d entry=%#v keys=%#v", writeProgress, entry, fake.keys())
	}
}

func TestS3ListPageUsesContinuationToken(t *testing.T) {
	fake := newFakeS3ObjectClient(map[string]fakeS3Object{
		"team/docs/a.txt": fakeObject("team/docs/a.txt", []byte("a"), ptr("text/plain")),
		"team/docs/b.txt": fakeObject("team/docs/b.txt", []byte("b"), ptr("text/plain")),
		"team/docs/c.txt": fakeObject("team/docs/c.txt", []byte("c"), ptr("text/plain")),
	})
	provider := testS3Provider(fake, defaultMaxBufferedObjectBytes)
	root := s3Root("team/docs")

	first, err := provider.ListPage(root, "", ListOptions{PageSize: 2, SortKey: "name", SortDirection: "asc"})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Entries) != 2 || first.Entries[0].Name != "a.txt" || first.Entries[1].Name != "b.txt" || first.NextCursor == nil {
		t.Fatalf("unexpected first page: %#v", first)
	}

	second, err := provider.ListPage(root, "", ListOptions{PageSize: 2, Cursor: first.NextCursor, SortKey: "name", SortDirection: "asc"})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Entries) != 1 || second.Entries[0].Name != "c.txt" || second.NextCursor != nil {
		t.Fatalf("unexpected second page: %#v", second)
	}
}

func TestS3ListPageScansForSearchAndNonNativeSort(t *testing.T) {
	fake := newFakeS3ObjectClient(map[string]fakeS3Object{
		"team/docs/small.txt": fakeObject("team/docs/small.txt", []byte("a"), ptr("text/plain")),
		"team/docs/large.txt": fakeObject("team/docs/large.txt", []byte("large"), ptr("text/plain")),
		"team/docs/data.json": fakeObject("team/docs/data.json", []byte("{}"), ptr("application/json")),
	})
	provider := testS3Provider(fake, defaultMaxBufferedObjectBytes)
	root := s3Root("team/docs")

	page, err := provider.ListPage(root, "", ListOptions{PageSize: 2, Query: "json", SortKey: "size", SortDirection: "desc"})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Entries) != 1 || page.Entries[0].Name != "data.json" || page.FilteredCount == nil || *page.FilteredCount != 1 {
		t.Fatalf("unexpected filtered page: %#v", page)
	}
}

func TestS3RequestChecksumCalculationDefaultsForStreamCompatibility(t *testing.T) {
	settings, err := s3ProviderSettingsFromConfig(config.ProviderConfig{
		ID:       "s3-main",
		Settings: map[string]string{"region": "us-east-1"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if settings.RequestChecksumCalculation != aws.RequestChecksumCalculationWhenRequired {
		t.Fatalf("default checksum calculation = %#v", settings.RequestChecksumCalculation)
	}

	settings, err = s3ProviderSettingsFromConfig(config.ProviderConfig{
		ID:       "s3-main",
		Settings: map[string]string{"region": "us-east-1", "requestChecksumCalculation": "when_supported"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if settings.RequestChecksumCalculation != aws.RequestChecksumCalculationWhenSupported {
		t.Fatalf("override checksum calculation = %#v", settings.RequestChecksumCalculation)
	}

	if _, err := s3ProviderSettingsFromConfig(config.ProviderConfig{
		ID:       "s3-main",
		Settings: map[string]string{"region": "us-east-1", "requestChecksumCalculation": "always"},
	}); err == nil {
		t.Fatal("expected invalid checksum calculation setting to fail")
	}
}

func TestAwsS3ObjectClientUsesProviderChecksumCalculation(t *testing.T) {
	client, err := NewAwsS3ObjectClient(
		S3ProviderSettings{Region: "us-east-1", RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired},
		S3AccountSettings{CredentialMode: "static", AccessKeyID: ptr("test-access"), SecretAccessKey: ptr("test-secret")},
	)
	if err != nil {
		t.Fatal(err)
	}
	if got := client.client.Options().RequestChecksumCalculation; got != aws.RequestChecksumCalculationWhenRequired {
		t.Fatalf("client checksum calculation = %#v", got)
	}
}

func TestAwsS3StreamPutSupportsUnseekableHTTPBody(t *testing.T) {
	var putReceived atomic.Bool
	endpoint := ""
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPut && r.URL.Path == "/cagnard-test/streamed.txt":
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Errorf("read request body: %v", err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			if string(body) != "hello" {
				t.Errorf("request body = %q", string(body))
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			putReceived.Store(true)
			w.WriteHeader(http.StatusOK)
		case r.Method == http.MethodHead && r.URL.Path == "/cagnard-test/streamed.txt":
			w.Header().Set("Content-Length", "5")
			w.Header().Set("Content-Type", "text/plain")
			w.Header().Set("ETag", `"test-etag"`)
			w.WriteHeader(http.StatusOK)
		default:
			t.Errorf("unexpected request %s %s to %s", r.Method, r.URL.Path, endpoint)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	endpoint = server.URL

	client, err := NewAwsS3ObjectClient(
		S3ProviderSettings{Region: "us-east-1", Endpoint: &endpoint, PathStyleAccess: true},
		S3AccountSettings{CredentialMode: "static", AccessKeyID: ptr("test-access"), SecretAccessKey: ptr("test-secret")},
	)
	if err != nil {
		t.Fatal(err)
	}

	reader, writer := io.Pipe()
	go func() {
		_, _ = writer.Write([]byte("hello"))
		_ = writer.Close()
	}()

	size := int64(5)
	metadata, err := client.StreamPut("cagnard-test", "streamed.txt", reader, FileContentInfo{FileName: "streamed.txt", MIMEType: ptr("text/plain"), Size: &size}, ptr("text/plain"), nil)
	if err != nil {
		t.Fatal(err)
	}
	if !putReceived.Load() {
		t.Fatal("expected streamed put request to reach test server")
	}
	if metadata.Size == nil || *metadata.Size != size {
		t.Fatalf("metadata size = %#v", metadata.Size)
	}
}

func TestS3DeletesPrefixesRecursively(t *testing.T) {
	fake := newFakeS3ObjectClient(map[string]fakeS3Object{
		"team/docs/folder/readme.txt":       fakeObject("team/docs/folder/readme.txt", []byte("hello"), ptr("text/plain")),
		"team/docs/folder/nested/deep.txt":  fakeObject("team/docs/folder/nested/deep.txt", []byte("deep"), ptr("text/plain")),
		"team/docs/folder/nested/":          fakeObject("team/docs/folder/nested/", []byte{}, ptr("application/x-directory")),
		"team/docs/folder/nested/keep.log":  fakeObject("team/docs/folder/nested/keep.log", []byte("log"), ptr("text/plain")),
		"team/docs/keep.txt":                fakeObject("team/docs/keep.txt", []byte("keep"), ptr("text/plain")),
		"team/docs/other/folder/readme.txt": fakeObject("team/docs/other/folder/readme.txt", []byte("other"), ptr("text/plain")),
	})
	provider := testS3Provider(fake, defaultMaxBufferedObjectBytes)
	if err := provider.Delete(s3Root("team/docs"), "folder"); err != nil {
		t.Fatal(err)
	}
	for _, key := range fake.keys() {
		if strings.HasPrefix(key, "team/docs/folder/") {
			t.Fatalf("folder key survived: %s in %#v", key, fake.keys())
		}
	}
	if !fake.has("team/docs/keep.txt") || !fake.has("team/docs/other/folder/readme.txt") {
		t.Fatalf("unrelated keys removed: %#v", fake.keys())
	}
}

func testS3Provider(fake S3ObjectClient, limit int64) *S3StorageProvider {
	return newS3StorageProvider(
		config.ProviderConfig{ID: "s3-main", Type: "s3", Family: "s3", DisplayName: "S3 compatible"},
		S3ProviderSettings{Region: "us-east-1", PathStyleAccess: true, SSLEnabled: true, MaxBufferedObjectBytes: limit, MaxListPages: 100},
		map[string]S3ObjectClient{"s3-account": fake},
	)
}

func s3Root(prefix string) ResolvedStorageRoot {
	return ResolvedStorageRoot{
		ID:             "s3-home",
		Label:          "Documents",
		Tunnel:         "personal",
		ProviderID:     "s3-main",
		AccountID:      "s3-account",
		ProviderFamily: "s3",
		Target:         ObjectStoreRootTarget{Bucket: "cagnard-test", Prefix: prefix},
		Settings:       map[string]string{},
	}
}

func s3TestConfig(rootLabel *string, prefix string) *config.CagnardConfig {
	mode := "development"
	defaultUser := "alice"
	return &config.CagnardConfig{
		Server: config.ServerConfig{Host: "127.0.0.1", Port: 8080},
		Auth:   config.AuthConfig{Mode: &mode, ConfiguredUsersEnabled: true, DefaultUser: &defaultUser},
		Users: []config.ConfiguredUser{
			{ID: "alice", DisplayName: "Alice", Roles: []string{"user"}},
		},
		Providers: []config.ProviderConfig{
			{ID: "s3-main", Type: "s3", Family: "s3", DisplayName: "S3 compatible", Settings: map[string]string{"region": "us-east-1", "endpoint": "http://127.0.0.1:9000", "pathStyleAccess": "true"}},
		},
		Accounts: []config.StorageAccountConfig{
			{ID: "s3-account", ProviderID: "s3-main", DisplayName: "S3 account", Enabled: true, AuthMode: "static", Settings: map[string]string{"accessKeyId": "test-access", "secretAccessKey": "test-secret"}},
		},
		PersonalStorage: []config.StorageRootConfig{
			{ID: "s3-home", Label: rootLabel, ProviderID: "s3-main", AccountID: "s3-account", Settings: map[string]string{"bucket": "cagnard-test", "prefix": prefix}, AllowedUsers: []string{"alice"}},
		},
	}
}

type fakeS3Object struct {
	bytes    []byte
	metadata S3ObjectMetadata
}

type fakeS3ObjectClient struct {
	mu      sync.Mutex
	objects map[string]fakeS3Object
}

func newFakeS3ObjectClient(initial map[string]fakeS3Object) *fakeS3ObjectClient {
	objects := map[string]fakeS3Object{}
	for key, value := range initial {
		objects[key] = value
	}
	return &fakeS3ObjectClient{objects: objects}
}

func (f *fakeS3ObjectClient) List(bucket string, prefix string, delimiter string, continuationToken *string, maxKeys int32) (S3ListPage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	matching := make([]string, 0)
	for key := range f.objects {
		if strings.HasPrefix(key, prefix) {
			matching = append(matching, key)
		}
	}
	sort.Strings(matching)
	prefixSet := map[string]bool{}
	objects := make([]S3ListedObject, 0)
	for _, key := range matching {
		rest := strings.TrimPrefix(key, prefix)
		if idx := strings.Index(rest, delimiter); idx >= 0 {
			prefixSet[prefix+rest[:idx+1]] = true
			continue
		}
		obj := f.objects[key]
		objects = append(objects, S3ListedObject{Key: key, Size: obj.metadata.Size, ETag: obj.metadata.ETag, LastModified: obj.metadata.LastModified, StorageClass: obj.metadata.StorageClass})
	}
	prefixes := make([]string, 0, len(prefixSet))
	for value := range prefixSet {
		prefixes = append(prefixes, value)
	}
	sort.Strings(prefixes)
	type listed struct {
		key    string
		object *S3ListedObject
		prefix *string
	}
	combined := make([]listed, 0, len(objects)+len(prefixes))
	for _, object := range objects {
		value := object
		combined = append(combined, listed{key: object.Key, object: &value})
	}
	for _, prefix := range prefixes {
		value := prefix
		combined = append(combined, listed{key: prefix, prefix: &value})
	}
	sort.SliceStable(combined, func(i, j int) bool { return combined[i].key < combined[j].key })
	start := 0
	if continuationToken != nil && *continuationToken != "" {
		parsed, err := strconv.Atoi(*continuationToken)
		if err == nil && parsed > 0 {
			start = parsed
		}
	}
	end := len(combined)
	if maxKeys > 0 && start+int(maxKeys) < end {
		end = start + int(maxKeys)
	}
	pageObjects := make([]S3ListedObject, 0)
	pagePrefixes := make([]string, 0)
	for _, item := range combined[start:end] {
		if item.object != nil {
			pageObjects = append(pageObjects, *item.object)
		}
		if item.prefix != nil {
			pagePrefixes = append(pagePrefixes, *item.prefix)
		}
	}
	var next *string
	if end < len(combined) {
		value := strconv.Itoa(end)
		next = &value
	}
	return S3ListPage{Objects: pageObjects, CommonPrefixes: pagePrefixes, NextContinuationToken: next}, nil
}

func (f *fakeS3ObjectClient) Head(bucket string, key string) (S3ObjectMetadata, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	obj, ok := f.objects[key]
	if !ok {
		return S3ObjectMetadata{}, errorsForFakeS3("Path does not exist")
	}
	return obj.metadata, nil
}

func (f *fakeS3ObjectClient) Exists(bucket string, key string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	_, ok := f.objects[key]
	return ok, nil
}

func (f *fakeS3ObjectClient) Get(bucket string, key string) (S3ObjectContent, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	obj, ok := f.objects[key]
	if !ok {
		return S3ObjectContent{}, errorsForFakeS3("Path does not exist")
	}
	return S3ObjectContent{Metadata: obj.metadata, Bytes: obj.bytes}, nil
}

func (f *fakeS3ObjectClient) Put(bucket string, key string, body []byte, contentType *string) (S3ObjectMetadata, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	metadata := fakeMetadata(key, int64(len(body)), contentType, nil, nil, nil)
	f.objects[key] = fakeS3Object{bytes: append([]byte{}, body...), metadata: metadata}
	return metadata, nil
}

func (f *fakeS3ObjectClient) StreamGet(bucket string, key string, output io.Writer, onBytes func(int64)) (S3ObjectMetadata, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	obj, ok := f.objects[key]
	if !ok {
		return S3ObjectMetadata{}, errorsForFakeS3("Path does not exist")
	}
	if _, err := copyWithProgress(output, bytes.NewReader(obj.bytes), onBytes); err != nil {
		return S3ObjectMetadata{}, err
	}
	return obj.metadata, nil
}

func (f *fakeS3ObjectClient) RangeGet(bucket string, key string, offset int64, length int64) (io.ReadCloser, S3ObjectMetadata, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	obj, ok := f.objects[key]
	if !ok {
		return nil, S3ObjectMetadata{}, errorsForFakeS3("Path does not exist")
	}
	size := int64(len(obj.bytes))
	if offset < 0 || offset >= size {
		return nil, S3ObjectMetadata{}, errorsForFakeS3("Requested range is not satisfiable")
	}
	end := size
	if length >= 0 && offset+length < size {
		end = offset + length
	}
	return io.NopCloser(bytes.NewReader(obj.bytes[offset:end])), obj.metadata, nil
}

func (f *fakeS3ObjectClient) StreamPut(bucket string, key string, input io.Reader, info FileContentInfo, contentType *string, onBytes func(int64)) (S3ObjectMetadata, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out bytes.Buffer
	if _, err := copyWithProgress(&out, input, onBytes); err != nil {
		return S3ObjectMetadata{}, err
	}
	metadata := fakeMetadata(key, int64(out.Len()), contentType, nil, nil, nil)
	f.objects[key] = fakeS3Object{bytes: append([]byte{}, out.Bytes()...), metadata: metadata}
	return metadata, nil
}

func (f *fakeS3ObjectClient) Copy(bucket string, sourceKey string, targetKey string) (S3ObjectMetadata, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	source, ok := f.objects[sourceKey]
	if !ok {
		return S3ObjectMetadata{}, errorsForFakeS3("Path does not exist")
	}
	metadata := source.metadata
	metadata.Key = targetKey
	f.objects[targetKey] = fakeS3Object{bytes: append([]byte{}, source.bytes...), metadata: metadata}
	return metadata, nil
}

func (f *fakeS3ObjectClient) Delete(bucket string, key string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.objects, key)
	return nil
}

func (f *fakeS3ObjectClient) has(key string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	_, ok := f.objects[key]
	return ok
}

func (f *fakeS3ObjectClient) keys() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, 0, len(f.objects))
	for key := range f.objects {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

func fakeObject(key string, bytes []byte, contentType *string) fakeS3Object {
	return fakeS3Object{bytes: append([]byte{}, bytes...), metadata: fakeMetadata(key, int64(len(bytes)), contentType, nil, nil, nil)}
}

func fakeMetadata(key string, size int64, contentType *string, versionID *string, encryption *string, retention *string) S3ObjectMetadata {
	modified := time.Date(2026, 7, 3, 0, 0, 0, 0, time.UTC)
	return S3ObjectMetadata{
		Key:          key,
		Size:         &size,
		ContentType:  contentType,
		LastModified: &modified,
		ETag:         ptr("etag"),
		VersionID:    versionID,
		StorageClass: ptr("STANDARD"),
		Encryption:   encryption,
		Retention:    retention,
		Checksum:     ptr("checksum"),
		ProviderSpecific: map[string]string{
			"s3.etag":         "etag",
			"s3.storageClass": "STANDARD",
			"s3.checksum":     "checksum",
		},
	}
}

func ptr(value string) *string {
	return &value
}

func int64Ptr(value int64) *int64 {
	return &value
}

func errorsForFakeS3(message string) error {
	return fmt.Errorf(message)
}
