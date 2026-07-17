package storage

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

func TestFilesystemContextStreamsAndRecursiveDelete(t *testing.T) {
	base := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.txt")
	if err := os.WriteFile(outside, []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(base, "tree", "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(base, "tree", "nested", "file.bin"), bytes.Repeat([]byte("x"), 1024), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(base, "tree", "link")); err != nil {
		t.Fatal(err)
	}
	provider := NewFilesystemProvider(config.ProviderConfig{ID: "local", Type: "filesystem", Family: "unix", DisplayName: "Local"})
	root := filesystemRoot(base)

	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := provider.StreamReadContext(canceled, root, "tree/nested/file.bin", &bytes.Buffer{}, nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled read error = %v", err)
	}
	if _, err := provider.StreamWriteContext(canceled, root, "never-created.bin", bytes.NewReader([]byte("data")), FileContentInfo{}, false, nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled write error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(base, "never-created.bin")); !os.IsNotExist(err) {
		t.Fatalf("canceled write left a file: %v", err)
	}

	var completed []string
	summary, err := provider.DeleteRecursive(context.Background(), root, "tree", func(event DeleteItemEvent) {
		if event.Status == "completed" {
			completed = append(completed, event.Path)
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	if summary.Deleted != 4 || summary.Failed != 0 || completed[len(completed)-1] != "tree" {
		t.Fatalf("unexpected recursive delete summary=%#v events=%#v", summary, completed)
	}
	if content, err := os.ReadFile(outside); err != nil || string(content) != "keep" {
		t.Fatalf("recursive delete followed symlink: content=%q err=%v", content, err)
	}
}

func TestFilesystemProviderReadAndMutationPaths(t *testing.T) {
	base := t.TempDir()
	if err := os.WriteFile(filepath.Join(base, "hello.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(base, "docs"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(base, "docs", "note.md"), []byte("# Note"), 0o644); err != nil {
		t.Fatal(err)
	}

	provider := NewFilesystemProvider(config.ProviderConfig{ID: "local", Type: "filesystem", Family: "unix", DisplayName: "Local"})
	root := filesystemRoot(base)

	entries, err := provider.List(root, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 || entries[0].Name != "docs" || entries[1].Name != "hello.txt" {
		t.Fatalf("unexpected entries: %#v", entries)
	}

	stat, err := provider.Stat(root, "hello.txt")
	if err != nil {
		t.Fatal(err)
	}
	if stat.Kind != "file" || stat.Metadata.MIMEType == nil || *stat.Metadata.MIMEType != "text/plain" {
		t.Fatalf("unexpected stat: %#v", stat)
	}

	preview, err := provider.Preview(root, "docs/note.md", 0, 1024)
	if err != nil {
		t.Fatal(err)
	}
	if preview.Content != "# Note" || preview.MIMEType == nil || *preview.MIMEType != "text/markdown" {
		t.Fatalf("unexpected preview: %#v", preview)
	}
	if preview.Truncated || preview.NextOffset != 6 || preview.TotalSize == nil || *preview.TotalSize != 6 {
		t.Fatalf("unexpected preview pagination fields: %#v", preview)
	}

	content, err := provider.Download(root, "hello.txt")
	if err != nil {
		t.Fatal(err)
	}
	if string(content.Bytes) != "hello" || content.FileName != "hello.txt" {
		t.Fatalf("unexpected download: %#v", content)
	}

	uploaded, err := provider.Upload(root, "new/file.txt", []byte("new"), false)
	if err != nil {
		t.Fatal(err)
	}
	if uploaded.Path != "new/file.txt" {
		t.Fatalf("uploaded path = %q", uploaded.Path)
	}

	folder, err := provider.CreateFolder(root, "", "archive")
	if err != nil {
		t.Fatal(err)
	}
	if folder.Kind != "directory" {
		t.Fatalf("folder kind = %q", folder.Kind)
	}

	renamed, err := provider.Rename(root, "new/file.txt", "renamed.txt")
	if err != nil {
		t.Fatal(err)
	}
	if renamed.Path != "new/renamed.txt" {
		t.Fatalf("renamed path = %q", renamed.Path)
	}

	copied, err := provider.Copy(root, "docs", "archive/docs-copy", false)
	if err != nil {
		t.Fatal(err)
	}
	if copied.Kind != "directory" {
		t.Fatalf("copied kind = %q", copied.Kind)
	}
	if _, err := os.Stat(filepath.Join(base, "archive", "docs-copy", "note.md")); err != nil {
		t.Fatalf("copied child missing: %v", err)
	}

	moved, err := provider.Move(root, "archive/docs-copy", "docs-moved", false)
	if err != nil {
		t.Fatal(err)
	}
	if moved.Path != "docs-moved" {
		t.Fatalf("moved path = %q", moved.Path)
	}

	if err := provider.Delete(root, "docs-moved"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(base, "docs-moved")); !os.IsNotExist(err) {
		t.Fatalf("expected docs-moved to be deleted, err=%v", err)
	}
}

func TestFilesystemProviderRejectsTraversalAndReadOnlyWrites(t *testing.T) {
	base := t.TempDir()
	provider := NewFilesystemProvider(config.ProviderConfig{ID: "local", Type: "filesystem", Family: "unix", DisplayName: "Local"})
	root := filesystemRoot(base)

	if _, err := provider.Upload(root, "../escape.txt", []byte("bad"), false); err == nil {
		t.Fatal("expected traversal upload to fail")
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(base), "escape.txt")); !os.IsNotExist(err) {
		t.Fatalf("escape file should not exist, err=%v", err)
	}

	root.ReadOnly = true
	if _, err := provider.Upload(root, "note.txt", []byte("no"), false); err == nil {
		t.Fatal("expected read-only upload to fail")
	}
}

func TestFilesystemPreviewPagination(t *testing.T) {
	base := t.TempDir()
	// "héllo world" — the é is two bytes, and a 2-byte page splits it.
	content := "héllo world"
	if err := os.WriteFile(filepath.Join(base, "page.txt"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	provider := NewFilesystemProvider(config.ProviderConfig{ID: "local", Type: "filesystem", Family: "unix", DisplayName: "Local"})
	root := filesystemRoot(base)

	first, err := provider.Preview(root, "page.txt", 0, 2)
	if err != nil {
		t.Fatal(err)
	}
	if first.Content != "h" || !first.Truncated || first.NextOffset != 1 {
		t.Fatalf("first page should stop before the split rune: %#v", first)
	}

	assembled := first.Content
	offset := first.NextOffset
	for pages := 0; pages < 20; pages++ {
		page, err := provider.Preview(root, "page.txt", offset, 2)
		if err != nil {
			t.Fatal(err)
		}
		assembled += page.Content
		offset = page.NextOffset
		if !page.Truncated {
			break
		}
	}
	if assembled != content {
		t.Fatalf("paginated content = %q, want %q", assembled, content)
	}

	atEnd, err := provider.Preview(root, "page.txt", int64(len(content)), 2)
	if err != nil {
		t.Fatal(err)
	}
	if atEnd.Content != "" || atEnd.Truncated {
		t.Fatalf("EOF offset should return an empty page: %#v", atEnd)
	}

	if _, err := provider.Preview(root, "page.txt", int64(len(content))+1, 2); err == nil {
		t.Fatal("expected out-of-range preview offset to fail")
	}
}

func TestFilesystemWatch(t *testing.T) {
	base := t.TempDir()
	target := filepath.Join(base, "app.log")
	if err := os.WriteFile(target, []byte("one\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	provider := NewFilesystemProvider(config.ProviderConfig{ID: "local", Type: "filesystem", Family: "unix", DisplayName: "Local"})
	root := filesystemRoot(base)

	cancel := make(chan struct{})
	defer close(cancel)
	events, err := provider.Watch(root, "app.log", cancel)
	if err != nil {
		t.Fatal(err)
	}

	appendToFile(t, target, "two\n")
	appended := nextWatchEvent(t, events)
	if appended.Kind != WatchEventAppended || appended.Offset != 4 || appended.Length != 4 {
		t.Fatalf("appended event = %#v", appended)
	}

	if err := os.WriteFile(target, []byte("x\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	replaced := nextWatchEvent(t, events)
	if replaced.Kind != WatchEventReplaced {
		t.Fatalf("replaced event = %#v", replaced)
	}

	if err := os.Remove(target); err != nil {
		t.Fatal(err)
	}
	// os.WriteFile truncates then writes, so a trailing appended event for the
	// new content may arrive before the removal is observed.
	for {
		event := nextWatchEvent(t, events)
		if event.Kind == WatchEventAppended {
			continue
		}
		if event.Kind != WatchEventRemoved {
			t.Fatalf("removed event = %#v", event)
		}
		break
	}
}

func appendToFile(t *testing.T, path string, content string) {
	t.Helper()
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.WriteString(content); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func nextWatchEvent(t *testing.T, events <-chan FileWatchEvent) FileWatchEvent {
	t.Helper()
	select {
	case event, ok := <-events:
		if !ok {
			t.Fatal("watch channel closed unexpectedly")
		}
		return event
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for watch event")
	}
	return FileWatchEvent{}
}

func filesystemRoot(base string) ResolvedStorageRoot {
	return ResolvedStorageRoot{
		ID:             "home",
		Label:          "Home",
		Tunnel:         "personal",
		ProviderID:     "local",
		AccountID:      "local-admin",
		ProviderFamily: "unix",
		ReadOnly:       false,
		Target:         FilesystemRootTarget{Path: base},
		Settings:       map[string]string{},
	}
}
