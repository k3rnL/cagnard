package storage

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

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

	preview, err := provider.Preview(root, "docs/note.md", 1024)
	if err != nil {
		t.Fatal(err)
	}
	if preview.Content != "# Note" || preview.MIMEType == nil || *preview.MIMEType != "text/markdown" {
		t.Fatalf("unexpected preview: %#v", preview)
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
