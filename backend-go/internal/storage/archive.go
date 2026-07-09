package storage

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
)

const ArchiveNestedSeparator = "!/"
const archiveEntryMaxBytes = 32 * 1024 * 1024
const archiveListMaxEntries = 10000

type ArchiveEntry struct {
	Path string
	Name string
	Kind string
	Size *int64
}

// IsBrowsableArchive reports whether archive listing is implemented for the
// file name. Formats outside the Go standard library (rar, 7z) stay
// metadata-only.
func IsBrowsableArchive(fileName string) bool {
	return archiveFormat(fileName) != ""
}

func archiveFormat(fileName string) string {
	lower := strings.ToLower(fileName)
	switch {
	case strings.HasSuffix(lower, ".zip"):
		return "zip"
	case strings.HasSuffix(lower, ".tar"):
		return "tar"
	case strings.HasSuffix(lower, ".tar.gz"), strings.HasSuffix(lower, ".tgz"):
		return "tar.gz"
	case strings.HasSuffix(lower, ".gz"):
		return "gz"
	default:
		return ""
	}
}

// ListArchiveEntries lists the contents of an archive stored at path. A
// non-empty nestedPath ("inner.zip" or "a.zip!/b.zip") descends into nested
// archives before listing.
func ListArchiveEntries(provider StorageProvider, root ResolvedStorageRoot, filePath string, nestedPath string) ([]ArchiveEntry, error) {
	source, err := resolveArchiveSource(provider, root, filePath, splitNestedPath(nestedPath))
	if err != nil {
		return nil, err
	}
	return listArchive(source)
}

// ReadArchiveEntry returns the content and file name of one entry inside an
// archive. Nested archives are addressed with "!/" separators, e.g.
// "inner.zip!/docs/readme.md".
func ReadArchiveEntry(provider StorageProvider, root ResolvedStorageRoot, filePath string, entryPath string) ([]byte, string, error) {
	segments := splitNestedPath(entryPath)
	if len(segments) == 0 {
		return nil, "", errors.New("Archive entry path cannot be empty")
	}
	target := segments[len(segments)-1]
	source, err := resolveArchiveSource(provider, root, filePath, segments[:len(segments)-1])
	if err != nil {
		return nil, "", err
	}
	content, err := readArchiveEntry(source, target)
	if err != nil {
		return nil, "", err
	}
	return content, entryFileName(source.name, target), nil
}

func splitNestedPath(nested string) []string {
	if strings.TrimSpace(nested) == "" {
		return nil
	}
	return strings.Split(nested, ArchiveNestedSeparator)
}

// archiveSource is either a provider-backed file (outer archive) or a
// buffered nested archive extracted from its parent.
type archiveSource struct {
	name     string
	provider StorageProvider
	root     ResolvedStorageRoot
	path     string
	data     []byte
}

func resolveArchiveSource(provider StorageProvider, root ResolvedStorageRoot, filePath string, nested []string) (archiveSource, error) {
	source := archiveSource{name: path.Base(filePath), provider: provider, root: root, path: filePath}
	for _, segment := range nested {
		if !IsBrowsableArchive(segment) {
			return archiveSource{}, fmt.Errorf("Entry is not a browsable archive: %s", segment)
		}
		content, err := readArchiveEntry(source, segment)
		if err != nil {
			return archiveSource{}, err
		}
		source = archiveSource{name: path.Base(segment), data: content}
	}
	return source, nil
}

func (s archiveSource) readerAt() (io.ReaderAt, int64, error) {
	if s.provider == nil {
		return bytes.NewReader(s.data), int64(len(s.data)), nil
	}
	info, err := s.provider.ContentInfo(s.root, s.path)
	if err != nil {
		return nil, 0, err
	}
	if info.Size == nil {
		return nil, 0, errors.New("Archive size is unknown")
	}
	return &providerReaderAt{provider: s.provider, root: s.root, path: s.path, size: *info.Size}, *info.Size, nil
}

func (s archiveSource) open() (io.ReadCloser, error) {
	if s.provider == nil {
		return io.NopCloser(bytes.NewReader(s.data)), nil
	}
	reader, _, err := s.provider.RangeRead(s.root, s.path, 0, -1)
	return reader, err
}

// providerReaderAt adapts RangeRead to io.ReaderAt so archive/zip can read
// only the central directory and requested entries instead of the whole file.
type providerReaderAt struct {
	provider StorageProvider
	root     ResolvedStorageRoot
	path     string
	size     int64
}

func (r *providerReaderAt) ReadAt(p []byte, off int64) (int, error) {
	if off >= r.size {
		return 0, io.EOF
	}
	reader, _, err := r.provider.RangeRead(r.root, r.path, off, int64(len(p)))
	if err != nil {
		return 0, err
	}
	defer reader.Close()
	read, err := io.ReadFull(reader, p)
	if errors.Is(err, io.ErrUnexpectedEOF) || errors.Is(err, io.EOF) {
		return read, io.EOF
	}
	return read, err
}

func listArchive(source archiveSource) ([]ArchiveEntry, error) {
	switch archiveFormat(source.name) {
	case "zip":
		return listZip(source)
	case "tar", "tar.gz":
		return listTar(source)
	case "gz":
		size := int64(-1)
		return []ArchiveEntry{{Path: gzipEntryName(source.name), Name: gzipEntryName(source.name), Kind: "file", Size: nilForUnknown(size)}}, nil
	default:
		return nil, fmt.Errorf("Archive format is not supported for browsing: %s", source.name)
	}
}

func listZip(source archiveSource) ([]ArchiveEntry, error) {
	readerAt, size, err := source.readerAt()
	if err != nil {
		return nil, err
	}
	archive, err := zip.NewReader(readerAt, size)
	if err != nil {
		return nil, fmt.Errorf("Cannot read zip archive: %s", err)
	}
	entries := make([]ArchiveEntry, 0, len(archive.File))
	for _, file := range archive.File {
		if len(entries) >= archiveListMaxEntries {
			break
		}
		name := normalizeArchiveEntryPath(file.Name)
		if name == "" {
			continue
		}
		kind := "file"
		var entrySize *int64
		if file.FileInfo().IsDir() {
			kind = "directory"
		} else {
			value := int64(file.UncompressedSize64)
			entrySize = &value
		}
		entries = append(entries, ArchiveEntry{Path: name, Name: path.Base(name), Kind: kind, Size: entrySize})
	}
	return entries, nil
}

func listTar(source archiveSource) ([]ArchiveEntry, error) {
	reader, closeStream, err := openTar(source)
	if err != nil {
		return nil, err
	}
	defer closeStream()
	entries := make([]ArchiveEntry, 0)
	for len(entries) < archiveListMaxEntries {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("Cannot read tar archive: %s", err)
		}
		name := normalizeArchiveEntryPath(header.Name)
		if name == "" {
			continue
		}
		switch header.Typeflag {
		case tar.TypeDir:
			entries = append(entries, ArchiveEntry{Path: name, Name: path.Base(name), Kind: "directory"})
		case tar.TypeReg:
			size := header.Size
			entries = append(entries, ArchiveEntry{Path: name, Name: path.Base(name), Kind: "file", Size: &size})
		}
	}
	return entries, nil
}

func readArchiveEntry(source archiveSource, entryPath string) ([]byte, error) {
	switch archiveFormat(source.name) {
	case "zip":
		return readZipEntry(source, entryPath)
	case "tar", "tar.gz":
		return readTarEntry(source, entryPath)
	case "gz":
		return readGzipContent(source)
	default:
		return nil, fmt.Errorf("Archive format is not supported for browsing: %s", source.name)
	}
}

func readZipEntry(source archiveSource, entryPath string) ([]byte, error) {
	readerAt, size, err := source.readerAt()
	if err != nil {
		return nil, err
	}
	archive, err := zip.NewReader(readerAt, size)
	if err != nil {
		return nil, fmt.Errorf("Cannot read zip archive: %s", err)
	}
	for _, file := range archive.File {
		if normalizeArchiveEntryPath(file.Name) != entryPath || file.FileInfo().IsDir() {
			continue
		}
		if int64(file.UncompressedSize64) > archiveEntryMaxBytes {
			return nil, fmt.Errorf("Archive entry exceeds read limit of %d bytes", archiveEntryMaxBytes)
		}
		content, err := file.Open()
		if err != nil {
			return nil, err
		}
		defer content.Close()
		return readBounded(content)
	}
	return nil, fmt.Errorf("Archive entry does not exist: %s", entryPath)
}

func readTarEntry(source archiveSource, entryPath string) ([]byte, error) {
	reader, closeStream, err := openTar(source)
	if err != nil {
		return nil, err
	}
	defer closeStream()
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return nil, fmt.Errorf("Archive entry does not exist: %s", entryPath)
		}
		if err != nil {
			return nil, fmt.Errorf("Cannot read tar archive: %s", err)
		}
		if header.Typeflag != tar.TypeReg || normalizeArchiveEntryPath(header.Name) != entryPath {
			continue
		}
		if header.Size > archiveEntryMaxBytes {
			return nil, fmt.Errorf("Archive entry exceeds read limit of %d bytes", archiveEntryMaxBytes)
		}
		return readBounded(reader)
	}
}

func readGzipContent(source archiveSource) ([]byte, error) {
	stream, err := source.open()
	if err != nil {
		return nil, err
	}
	defer stream.Close()
	decompressed, err := gzip.NewReader(stream)
	if err != nil {
		return nil, fmt.Errorf("Cannot read gzip content: %s", err)
	}
	defer decompressed.Close()
	return readBounded(decompressed)
}

func openTar(source archiveSource) (*tar.Reader, func(), error) {
	stream, err := source.open()
	if err != nil {
		return nil, nil, err
	}
	if archiveFormat(source.name) == "tar.gz" {
		decompressed, err := gzip.NewReader(stream)
		if err != nil {
			_ = stream.Close()
			return nil, nil, fmt.Errorf("Cannot read gzip content: %s", err)
		}
		return tar.NewReader(decompressed), func() {
			_ = decompressed.Close()
			_ = stream.Close()
		}, nil
	}
	return tar.NewReader(stream), func() { _ = stream.Close() }, nil
}

func readBounded(reader io.Reader) ([]byte, error) {
	content, err := io.ReadAll(io.LimitReader(reader, archiveEntryMaxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(content)) > archiveEntryMaxBytes {
		return nil, fmt.Errorf("Archive entry exceeds read limit of %d bytes", archiveEntryMaxBytes)
	}
	return content, nil
}

func normalizeArchiveEntryPath(name string) string {
	cleaned := path.Clean(strings.TrimPrefix(strings.ReplaceAll(name, "\\", "/"), "./"))
	cleaned = strings.TrimSuffix(cleaned, "/")
	if cleaned == "." || cleaned == "" || strings.HasPrefix(cleaned, "../") || path.IsAbs(cleaned) {
		return ""
	}
	return cleaned
}

func gzipEntryName(sourceName string) string {
	return strings.TrimSuffix(sourceName, ".gz")
}

func entryFileName(sourceName string, entryPath string) string {
	if archiveFormat(sourceName) == "gz" {
		return gzipEntryName(sourceName)
	}
	return path.Base(entryPath)
}

func nilForUnknown(size int64) *int64 {
	if size < 0 {
		return nil
	}
	return &size
}
