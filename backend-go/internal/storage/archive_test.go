package storage

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"os"
	"path/filepath"
	"testing"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

func TestArchiveZipListingAndEntryRead(t *testing.T) {
	base := t.TempDir()
	writeFileForArchive(t, filepath.Join(base, "bundle.zip"), buildZip(t, map[string][]byte{
		"docs/readme.md": []byte("# Hello"),
		"data.json":      []byte(`{"ok":true}`),
	}))
	provider, root := archiveTestProvider(base)

	entries, err := ListArchiveEntries(provider, root, "bundle.zip", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("entries = %#v", entries)
	}

	content, name, err := ReadArchiveEntry(provider, root, "bundle.zip", "docs/readme.md")
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "# Hello" || name != "readme.md" {
		t.Fatalf("entry read = %q name = %q", content, name)
	}

	if _, _, err := ReadArchiveEntry(provider, root, "bundle.zip", "missing.txt"); err == nil {
		t.Fatal("expected missing entry to fail")
	}
}

func TestArchiveTarAndGzip(t *testing.T) {
	base := t.TempDir()
	writeFileForArchive(t, filepath.Join(base, "bundle.tar"), buildTar(t, map[string][]byte{
		"logs/app.log": []byte("INFO ok\n"),
	}))
	writeFileForArchive(t, filepath.Join(base, "bundle.tar.gz"), gzipBytes(t, buildTar(t, map[string][]byte{
		"nested/note.txt": []byte("note"),
	})))
	writeFileForArchive(t, filepath.Join(base, "single.txt.gz"), gzipBytes(t, []byte("plain content")))
	provider, root := archiveTestProvider(base)

	tarEntries, err := ListArchiveEntries(provider, root, "bundle.tar", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(tarEntries) != 1 || tarEntries[0].Path != "logs/app.log" {
		t.Fatalf("tar entries = %#v", tarEntries)
	}
	tarContent, _, err := ReadArchiveEntry(provider, root, "bundle.tar", "logs/app.log")
	if err != nil || string(tarContent) != "INFO ok\n" {
		t.Fatalf("tar entry = %q err = %v", tarContent, err)
	}

	tgzEntries, err := ListArchiveEntries(provider, root, "bundle.tar.gz", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(tgzEntries) != 1 || tgzEntries[0].Path != "nested/note.txt" {
		t.Fatalf("tar.gz entries = %#v", tgzEntries)
	}

	gzEntries, err := ListArchiveEntries(provider, root, "single.txt.gz", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(gzEntries) != 1 || gzEntries[0].Name != "single.txt" {
		t.Fatalf("gz entries = %#v", gzEntries)
	}
	gzContent, gzName, err := ReadArchiveEntry(provider, root, "single.txt.gz", "single.txt")
	if err != nil || string(gzContent) != "plain content" || gzName != "single.txt" {
		t.Fatalf("gz entry = %q name = %q err = %v", gzContent, gzName, err)
	}
}

func TestArchiveNestedZipInZip(t *testing.T) {
	base := t.TempDir()
	inner := buildZip(t, map[string][]byte{"deep/secret.txt": []byte("nested content")})
	outer := buildZip(t, map[string][]byte{"inner.zip": inner, "top.txt": []byte("top")})
	writeFileForArchive(t, filepath.Join(base, "outer.zip"), outer)
	provider, root := archiveTestProvider(base)

	nestedEntries, err := ListArchiveEntries(provider, root, "outer.zip", "inner.zip")
	if err != nil {
		t.Fatal(err)
	}
	if len(nestedEntries) != 1 || nestedEntries[0].Path != "deep/secret.txt" {
		t.Fatalf("nested entries = %#v", nestedEntries)
	}

	content, name, err := ReadArchiveEntry(provider, root, "outer.zip", "inner.zip!/deep/secret.txt")
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "nested content" || name != "secret.txt" {
		t.Fatalf("nested entry = %q name = %q", content, name)
	}
}

func TestArchiveUnsupportedFormat(t *testing.T) {
	base := t.TempDir()
	writeFileForArchive(t, filepath.Join(base, "archive.rar"), []byte("not really rar"))
	provider, root := archiveTestProvider(base)

	if IsBrowsableArchive("archive.rar") || IsBrowsableArchive("archive.7z") {
		t.Fatal("rar/7z must not be browsable")
	}
	if _, err := ListArchiveEntries(provider, root, "archive.rar", ""); err == nil {
		t.Fatal("expected unsupported format to fail")
	}
}

func archiveTestProvider(base string) (*FilesystemProvider, ResolvedStorageRoot) {
	provider := NewFilesystemProvider(config.ProviderConfig{ID: "local", Type: "filesystem", Family: "unix", DisplayName: "Local"})
	return provider, filesystemRoot(base)
}

func writeFileForArchive(t *testing.T, path string, content []byte) {
	t.Helper()
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatal(err)
	}
}

func buildZip(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for name, content := range files {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write(content); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func buildTar(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := tar.NewWriter(&buffer)
	for name, content := range files {
		if err := writer.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(content)), Typeflag: tar.TypeReg}); err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write(content); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func gzipBytes(t *testing.T, content []byte) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := gzip.NewWriter(&buffer)
	if _, err := writer.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}
