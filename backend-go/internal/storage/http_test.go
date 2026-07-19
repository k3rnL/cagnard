package storage

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

var httpFixtureFiles = map[string]string{
	"readme.md":                 "# Demo\n",
	"logs/server.log":           "line one\nline two\nline three\n",
	"data/nested/values.csv":    "id,name\n1,alpha\n2,beta\n",
	"data/binaire/blob.payload": string([]byte{0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07}),
	"accented/résumé.txt":       "salut\n",
}

func httpFixtureManifest() httpManifest {
	entries := []httpManifestEntry{
		{Path: "logs", Kind: "directory", ModifiedTime: "2026-07-01T00:00:00Z"},
	}
	for filePath, content := range httpFixtureFiles {
		size := int64(len(content))
		entries = append(entries, httpManifestEntry{
			Path:         filePath,
			Kind:         "file",
			Size:         &size,
			ModifiedTime: "2026-07-02T00:00:00Z",
		})
	}
	return httpManifest{Version: 1, Entries: entries}
}

func newHTTPFixtureOrigin(t *testing.T, honorRanges bool) *httptest.Server {
	t.Helper()
	manifest, err := json.Marshal(httpFixtureManifest())
	if err != nil {
		t.Fatalf("marshal manifest: %v", err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requested := strings.TrimPrefix(r.URL.Path, "/demo/")
		if requested == "manifest.json" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write(manifest)
			return
		}
		unescaped := requested
		content, ok := httpFixtureFiles[unescaped]
		if !ok {
			http.NotFound(w, r)
			return
		}
		if honorRanges {
			http.ServeContent(w, r, unescaped, time.Unix(0, 0), strings.NewReader(content))
			return
		}
		// Deliberately ignore Range headers to exercise the fallback path.
		_, _ = io.WriteString(w, content)
	}))
	t.Cleanup(server.Close)
	return server
}

func newHTTPFixtureProvider(t *testing.T, honorRanges bool, prefix string) (*HTTPStorageProvider, ResolvedStorageRoot) {
	t.Helper()
	origin := newHTTPFixtureOrigin(t, honorRanges)
	provider, err := NewHTTPStorageProviderFromConfig(config.ProviderConfig{
		ID:          "demo-http",
		Family:      "http",
		DisplayName: "Demo HTTP",
		Settings:    map[string]string{"baseUrl": origin.URL + "/demo"},
	})
	if err != nil {
		t.Fatalf("provider construction failed: %v", err)
	}
	root := ResolvedStorageRoot{
		ID:         "shared",
		Label:      "Global",
		Tunnel:     "global",
		ProviderID: "demo-http",
		ReadOnly:   true,
		Target:     HTTPRootTarget{Prefix: prefix},
	}
	return provider, root
}

func TestHTTPProviderRequiresBaseURL(t *testing.T) {
	if _, err := NewHTTPStorageProviderFromConfig(config.ProviderConfig{ID: "x"}); err == nil {
		t.Fatal("expected an error without baseUrl")
	}
}

func TestHTTPProviderListRoot(t *testing.T) {
	provider, root := newHTTPFixtureProvider(t, true, "")
	entries, err := provider.List(root, "")
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	names := make([]string, 0, len(entries))
	kinds := map[string]string{}
	for _, entry := range entries {
		names = append(names, entry.Name)
		kinds[entry.Name] = entry.Kind
	}
	expected := []string{"accented", "data", "logs", "readme.md"}
	if strings.Join(names, ",") != strings.Join(expected, ",") {
		t.Fatalf("unexpected root listing: %v", names)
	}
	if kinds["data"] != "directory" {
		t.Fatalf("derived parent 'data' should be a directory, got %s", kinds["data"])
	}
	if kinds["readme.md"] != "file" {
		t.Fatalf("readme.md should be a file, got %s", kinds["readme.md"])
	}
}

func TestHTTPProviderListNestedAndErrors(t *testing.T) {
	provider, root := newHTTPFixtureProvider(t, true, "")
	entries, err := provider.List(root, "data/nested")
	if err != nil {
		t.Fatalf("List nested failed: %v", err)
	}
	if len(entries) != 1 || entries[0].Name != "values.csv" || entries[0].Path != "data/nested/values.csv" {
		t.Fatalf("unexpected nested listing: %+v", entries)
	}
	if _, err := provider.List(root, "missing"); err == nil || !strings.Contains(err.Error(), "does not exist") {
		t.Fatalf("expected missing-path error, got %v", err)
	}
	if _, err := provider.List(root, "readme.md"); err == nil || !strings.Contains(err.Error(), "not a directory") {
		t.Fatalf("expected not-a-directory error, got %v", err)
	}
	if _, err := provider.List(root, "../escape"); err == nil {
		t.Fatal("expected escape rejection")
	}
}

func TestHTTPProviderListPage(t *testing.T) {
	provider, root := newHTTPFixtureProvider(t, true, "")
	page, err := provider.ListPage(root, "", ListOptions{PageSize: 2, SortKey: "name", SortDirection: "desc"})
	if err != nil {
		t.Fatalf("ListPage failed: %v", err)
	}
	if len(page.Entries) != 2 || page.Entries[0].Name != "readme.md" {
		t.Fatalf("unexpected first page: %+v", page.Entries)
	}
	if page.NextCursor == nil {
		t.Fatal("expected a next cursor")
	}
	query, err := provider.ListPage(root, "", ListOptions{Query: "readme"})
	if err != nil {
		t.Fatalf("ListPage query failed: %v", err)
	}
	if len(query.Entries) != 1 || query.Entries[0].Name != "readme.md" {
		t.Fatalf("unexpected query result: %+v", query.Entries)
	}
}

func TestHTTPProviderStat(t *testing.T) {
	provider, root := newHTTPFixtureProvider(t, true, "")
	entry, err := provider.Stat(root, "logs/server.log")
	if err != nil {
		t.Fatalf("Stat failed: %v", err)
	}
	if entry.Kind != "file" || entry.Path != "logs/server.log" {
		t.Fatalf("unexpected stat entry: %+v", entry)
	}
	if entry.Metadata.Size == nil || *entry.Metadata.Size != int64(len(httpFixtureFiles["logs/server.log"])) {
		t.Fatalf("unexpected stat size: %+v", entry.Metadata.Size)
	}
	rootEntry, err := provider.Stat(root, "")
	if err != nil {
		t.Fatalf("Stat root failed: %v", err)
	}
	if rootEntry.Kind != "directory" || rootEntry.Name != "Global" {
		t.Fatalf("unexpected root entry: %+v", rootEntry)
	}
}

func TestHTTPProviderDownloadAndContentInfo(t *testing.T) {
	provider, root := newHTTPFixtureProvider(t, true, "")
	content, err := provider.Download(root, "data/nested/values.csv")
	if err != nil {
		t.Fatalf("Download failed: %v", err)
	}
	if string(content.Bytes) != httpFixtureFiles["data/nested/values.csv"] {
		t.Fatalf("unexpected download bytes: %q", content.Bytes)
	}
	if content.MIMEType == nil || !strings.Contains(*content.MIMEType, "csv") {
		t.Fatalf("unexpected mime type: %v", content.MIMEType)
	}
	info, err := provider.ContentInfo(root, "readme.md")
	if err != nil {
		t.Fatalf("ContentInfo failed: %v", err)
	}
	if info.FileName != "readme.md" || int64Value(info.Size) != int64(len(httpFixtureFiles["readme.md"])) {
		t.Fatalf("unexpected content info: %+v", info)
	}
	if _, err := provider.ContentInfo(root, "logs"); err == nil || !strings.Contains(err.Error(), "not a regular file") {
		t.Fatalf("expected regular-file error, got %v", err)
	}
}

func TestHTTPProviderRangeRead(t *testing.T) {
	for _, honorRanges := range []bool{true, false} {
		provider, root := newHTTPFixtureProvider(t, honorRanges, "")
		reader, info, err := provider.RangeRead(root, "logs/server.log", 5, 3)
		if err != nil {
			t.Fatalf("RangeRead (honor=%v) failed: %v", honorRanges, err)
		}
		chunk, err := io.ReadAll(reader)
		_ = reader.Close()
		if err != nil {
			t.Fatalf("range read failed: %v", err)
		}
		expected := httpFixtureFiles["logs/server.log"][5:8]
		if string(chunk) != expected {
			t.Fatalf("unexpected range chunk (honor=%v): %q != %q", honorRanges, chunk, expected)
		}
		if int64Value(info.Size) != int64(len(httpFixtureFiles["logs/server.log"])) {
			t.Fatalf("info should report total size, got %v", info.Size)
		}
		tail, _, err := provider.RangeRead(root, "logs/server.log", 9, -1)
		if err != nil {
			t.Fatalf("tail range failed: %v", err)
		}
		tailBytes, _ := io.ReadAll(tail)
		_ = tail.Close()
		if string(tailBytes) != httpFixtureFiles["logs/server.log"][9:] {
			t.Fatalf("unexpected tail (honor=%v): %q", honorRanges, tailBytes)
		}
		if _, _, err := provider.RangeRead(root, "logs/server.log", 999, 1); err == nil {
			t.Fatal("expected out-of-range error")
		}
	}
}

func TestHTTPProviderPreview(t *testing.T) {
	provider, root := newHTTPFixtureProvider(t, true, "")
	preview, err := provider.Preview(root, "logs/server.log", 0, 8)
	if err != nil {
		t.Fatalf("Preview failed: %v", err)
	}
	if !preview.Truncated || preview.Content != "line one" {
		t.Fatalf("unexpected preview: %+v", preview)
	}
	rest, err := provider.Preview(root, "logs/server.log", preview.NextOffset, 1024)
	if err != nil {
		t.Fatalf("Preview continuation failed: %v", err)
	}
	if rest.Truncated || !strings.HasSuffix(rest.Content, "line three\n") {
		t.Fatalf("unexpected continuation: %+v", rest)
	}
	size := int64(len(httpFixtureFiles["logs/server.log"]))
	atEnd, err := provider.Preview(root, "logs/server.log", size, 1024)
	if err != nil {
		t.Fatalf("Preview at EOF failed: %v", err)
	}
	if atEnd.Truncated || atEnd.Content != "" {
		t.Fatalf("unexpected EOF preview: %+v", atEnd)
	}
	if _, err := provider.Preview(root, "data/binaire/blob.payload", 0, 16); err == nil {
		t.Fatal("expected binary preview rejection")
	}
}

func TestHTTPProviderStreamRead(t *testing.T) {
	provider, root := newHTTPFixtureProvider(t, true, "")
	var output bytes.Buffer
	var progressed int64
	info, err := provider.StreamRead(root, "data/nested/values.csv", &output, func(n int64) { progressed += n })
	if err != nil {
		t.Fatalf("StreamRead failed: %v", err)
	}
	if output.String() != httpFixtureFiles["data/nested/values.csv"] {
		t.Fatalf("unexpected streamed bytes: %q", output.String())
	}
	if progressed != int64Value(info.Size) {
		t.Fatalf("progress %d should equal size %d", progressed, int64Value(info.Size))
	}
}

func TestHTTPProviderPrefixedRoot(t *testing.T) {
	provider, root := newHTTPFixtureProvider(t, true, "data")
	entries, err := provider.List(root, "")
	if err != nil {
		t.Fatalf("List with prefix failed: %v", err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name+":"+entry.Path)
	}
	if strings.Join(names, ",") != "binaire:binaire,nested:nested" {
		t.Fatalf("unexpected prefixed listing: %v", names)
	}
	entry, err := provider.Stat(root, "nested/values.csv")
	if err != nil {
		t.Fatalf("Stat with prefix failed: %v", err)
	}
	if entry.Path != "nested/values.csv" {
		t.Fatalf("stat path should be root-relative, got %s", entry.Path)
	}
}

func TestHTTPProviderEscapedURLs(t *testing.T) {
	provider, root := newHTTPFixtureProvider(t, true, "")
	content, err := provider.Download(root, "accented/résumé.txt")
	if err != nil {
		t.Fatalf("Download of accented path failed: %v", err)
	}
	if string(content.Bytes) != "salut\n" {
		t.Fatalf("unexpected accented content: %q", content.Bytes)
	}
}

func TestHTTPProviderMutationsRejected(t *testing.T) {
	provider, root := newHTTPFixtureProvider(t, true, "")
	if _, err := provider.Upload(root, "x", nil, false); err != errHTTPReadOnly {
		t.Fatalf("Upload should be read-only, got %v", err)
	}
	if _, err := provider.CreateFolder(root, "", "x"); err != errHTTPReadOnly {
		t.Fatalf("CreateFolder should be read-only, got %v", err)
	}
	if _, err := provider.Rename(root, "readme.md", "x"); err != errHTTPReadOnly {
		t.Fatalf("Rename should be read-only, got %v", err)
	}
	if err := provider.Delete(root, "readme.md"); err != errHTTPReadOnly {
		t.Fatalf("Delete should be read-only, got %v", err)
	}
	if _, err := provider.Copy(root, "readme.md", "x", false); err != errHTTPReadOnly {
		t.Fatalf("Copy should be read-only, got %v", err)
	}
	if _, err := provider.Move(root, "readme.md", "x", false); err != errHTTPReadOnly {
		t.Fatalf("Move should be read-only, got %v", err)
	}
}

func TestHTTPProviderManifestRetryAfterFailure(t *testing.T) {
	failures := 1
	manifest, _ := json.Marshal(httpFixtureManifest())
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if failures > 0 {
			failures--
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		_, _ = w.Write(manifest)
	}))
	defer server.Close()
	provider, err := NewHTTPStorageProviderFromConfig(config.ProviderConfig{
		ID:       "retry",
		Settings: map[string]string{"baseUrl": server.URL, "manifestUrl": server.URL + "/manifest.json"},
	})
	if err != nil {
		t.Fatalf("provider construction failed: %v", err)
	}
	root := ResolvedStorageRoot{ID: "r", Label: "R", Tunnel: "global", Target: HTTPRootTarget{}}
	if _, err := provider.List(root, ""); err == nil {
		t.Fatal("first call should fail while the manifest is unavailable")
	}
	if _, err := provider.List(root, ""); err != nil {
		t.Fatalf("second call should succeed after recovery: %v", err)
	}
}
