package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

type FilesystemProvider struct {
	descriptor ProviderDescriptor
}

func NewFilesystemProvider(cfg config.ProviderConfig) *FilesystemProvider {
	return &FilesystemProvider{
		descriptor: ProviderDescriptor{
			ID:           cfg.ID,
			Family:       cfg.Family,
			DisplayName:  cfg.DisplayName,
			ProviderType: cfg.Type,
		},
	}
}

func (p *FilesystemProvider) Descriptor() ProviderDescriptor {
	return p.descriptor
}

func (p *FilesystemProvider) Capabilities(root ResolvedStorageRoot) []CapabilityStatus {
	return FilesystemCapabilities(root.ReadOnly)
}

func (p *FilesystemProvider) List(root ResolvedStorageRoot, path string) ([]StorageEntry, error) {
	target, err := p.resolve(root, path)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(target)
	if err != nil {
		return nil, fmt.Errorf("Path does not exist: %s", path)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("Path is not a directory: %s", path)
	}
	entries, err := os.ReadDir(target)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	out := make([]StorageEntry, 0, len(entries))
	for _, entry := range entries {
		storageEntry, err := p.entry(root, filepath.Join(target, entry.Name()))
		if err != nil {
			return nil, err
		}
		out = append(out, storageEntry)
	}
	return out, nil
}

func (p *FilesystemProvider) ListPage(root ResolvedStorageRoot, path string, options ListOptions) (ListPage, error) {
	entries, err := p.List(root, path)
	if err != nil {
		return ListPage{}, err
	}
	return FilterSortAndSliceEntries(entries, options)
}

func (p *FilesystemProvider) Stat(root ResolvedStorageRoot, path string) (StorageEntry, error) {
	target, err := p.resolve(root, path)
	if err != nil {
		return StorageEntry{}, err
	}
	if _, err := os.Stat(target); err != nil {
		return StorageEntry{}, fmt.Errorf("Path does not exist: %s", path)
	}
	return p.entry(root, target)
}

func (p *FilesystemProvider) Download(root ResolvedStorageRoot, path string) (FileContent, error) {
	target, err := p.resolve(root, path)
	if err != nil {
		return FileContent{}, err
	}
	info, err := os.Stat(target)
	if err != nil {
		return FileContent{}, fmt.Errorf("Path does not exist: %s", path)
	}
	if !info.Mode().IsRegular() {
		return FileContent{}, fmt.Errorf("Path is not a regular file: %s", path)
	}
	bytes, err := os.ReadFile(target)
	if err != nil {
		return FileContent{}, err
	}
	return FileContent{FileName: filepath.Base(target), MIMEType: p.mimeType(target), Bytes: bytes}, nil
}

func (p *FilesystemProvider) ContentInfo(root ResolvedStorageRoot, path string) (FileContentInfo, error) {
	target, err := p.resolve(root, path)
	if err != nil {
		return FileContentInfo{}, err
	}
	info, err := os.Stat(target)
	if err != nil {
		return FileContentInfo{}, fmt.Errorf("Path does not exist: %s", path)
	}
	if !info.Mode().IsRegular() {
		return FileContentInfo{}, fmt.Errorf("Path is not a regular file: %s", path)
	}
	size := info.Size()
	return FileContentInfo{FileName: filepath.Base(target), MIMEType: p.mimeType(target), Size: &size}, nil
}

func (p *FilesystemProvider) Preview(root ResolvedStorageRoot, path string, offset int64, maxBytes int64) (TextPreview, error) {
	target, err := p.resolve(root, path)
	if err != nil {
		return TextPreview{}, err
	}
	info, err := os.Stat(target)
	if err != nil {
		return TextPreview{}, fmt.Errorf("Path does not exist: %s", path)
	}
	if !info.Mode().IsRegular() {
		return TextPreview{}, fmt.Errorf("Path is not a regular file: %s", path)
	}
	mimeType := p.mimeType(target)
	if !isTextLike(filepath.Base(target), mimeType) {
		return TextPreview{}, errors.New("File type is not supported for text preview")
	}
	size := info.Size()
	// offset == size is a valid position: follow mode polls from EOF and an
	// empty, non-truncated page means "nothing new yet".
	if offset < 0 || offset > size {
		return TextPreview{}, fmt.Errorf("Preview offset %d is outside file size %d", offset, size)
	}
	input, err := os.Open(target)
	if err != nil {
		return TextPreview{}, err
	}
	defer input.Close()
	if offset > 0 {
		if _, err := input.Seek(offset, io.SeekStart); err != nil {
			return TextPreview{}, err
		}
	}
	chunk, err := io.ReadAll(io.LimitReader(input, maxBytes))
	if err != nil {
		return TextPreview{}, err
	}
	return textPreviewPage(path, mimeType, chunk, offset, size), nil
}

func (p *FilesystemProvider) Upload(root ResolvedStorageRoot, path string, bytes []byte, overwrite bool) (StorageEntry, error) {
	if err := ensureWritable(root); err != nil {
		return StorageEntry{}, err
	}
	target, err := p.resolve(root, path)
	if err != nil {
		return StorageEntry{}, err
	}
	if _, err := os.Stat(target); err == nil && !overwrite {
		return StorageEntry{}, errors.New("Target already exists")
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return StorageEntry{}, err
	}
	flag := os.O_CREATE | os.O_WRONLY
	if overwrite {
		flag |= os.O_TRUNC
	} else {
		flag |= os.O_EXCL
	}
	file, err := os.OpenFile(target, flag, 0o644)
	if err != nil {
		return StorageEntry{}, err
	}
	if _, err := file.Write(bytes); err != nil {
		_ = file.Close()
		return StorageEntry{}, err
	}
	if err := file.Close(); err != nil {
		return StorageEntry{}, err
	}
	return p.Stat(root, path)
}

func (p *FilesystemProvider) CreateFolder(root ResolvedStorageRoot, parentPath string, name string) (StorageEntry, error) {
	if err := ensureWritable(root); err != nil {
		return StorageEntry{}, err
	}
	folderName, err := validName(name)
	if err != nil {
		return StorageEntry{}, err
	}
	parent, err := p.resolve(root, parentPath)
	if err != nil {
		return StorageEntry{}, err
	}
	target := filepath.Clean(filepath.Join(parent, folderName))
	if err := p.validateInside(root, target); err != nil {
		return StorageEntry{}, err
	}
	if _, err := os.Stat(target); err == nil {
		return StorageEntry{}, errors.New("Target already exists")
	}
	if err := os.MkdirAll(target, 0o755); err != nil {
		return StorageEntry{}, err
	}
	return p.Stat(root, joinPath(parentPath, folderName))
}

func (p *FilesystemProvider) Rename(root ResolvedStorageRoot, path string, newName string) (StorageEntry, error) {
	if err := ensureWritable(root); err != nil {
		return StorageEntry{}, err
	}
	name, err := validName(newName)
	if err != nil {
		return StorageEntry{}, err
	}
	source, err := p.resolve(root, path)
	if err != nil {
		return StorageEntry{}, err
	}
	parent := filepath.Dir(source)
	if source == parent {
		return StorageEntry{}, errors.New("Cannot rename storage root")
	}
	target := filepath.Clean(filepath.Join(parent, name))
	if err := p.validateInside(root, target); err != nil {
		return StorageEntry{}, err
	}
	if _, err := os.Stat(source); err != nil {
		return StorageEntry{}, fmt.Errorf("Path does not exist: %s", path)
	}
	if _, err := os.Stat(target); err == nil {
		return StorageEntry{}, errors.New("Target already exists")
	}
	if err := os.Rename(source, target); err != nil {
		return StorageEntry{}, err
	}
	return p.entry(root, target)
}

func (p *FilesystemProvider) Delete(root ResolvedStorageRoot, path string) error {
	if err := ensureWritable(root); err != nil {
		return err
	}
	if strings.TrimSpace(path) == "" {
		return errors.New("Cannot delete storage root")
	}
	target, err := p.resolve(root, path)
	if err != nil {
		return err
	}
	if _, err := os.Lstat(target); err != nil {
		return fmt.Errorf("Path does not exist: %s", path)
	}
	if err := os.RemoveAll(target); err != nil {
		return fmt.Errorf("Cannot delete %s: %s", path, err.Error())
	}
	return nil
}

func (p *FilesystemProvider) Copy(root ResolvedStorageRoot, sourcePath string, targetPath string, overwrite bool) (StorageEntry, error) {
	if err := ensureWritable(root); err != nil {
		return StorageEntry{}, err
	}
	source, err := p.resolve(root, sourcePath)
	if err != nil {
		return StorageEntry{}, err
	}
	target, err := p.resolve(root, targetPath)
	if err != nil {
		return StorageEntry{}, err
	}
	if _, err := os.Stat(source); err != nil {
		return StorageEntry{}, fmt.Errorf("Path does not exist: %s", sourcePath)
	}
	if err := ensureTargetWritable(target, overwrite); err != nil {
		return StorageEntry{}, err
	}
	if err := p.copyPath(source, target, overwrite); err != nil {
		return StorageEntry{}, err
	}
	return p.entry(root, target)
}

func (p *FilesystemProvider) Move(root ResolvedStorageRoot, sourcePath string, targetPath string, overwrite bool) (StorageEntry, error) {
	if err := ensureWritable(root); err != nil {
		return StorageEntry{}, err
	}
	source, err := p.resolve(root, sourcePath)
	if err != nil {
		return StorageEntry{}, err
	}
	target, err := p.resolve(root, targetPath)
	if err != nil {
		return StorageEntry{}, err
	}
	base, err := p.base(root)
	if err != nil {
		return StorageEntry{}, err
	}
	if source == base {
		return StorageEntry{}, errors.New("Cannot move storage root")
	}
	if _, err := os.Stat(source); err != nil {
		return StorageEntry{}, fmt.Errorf("Path does not exist: %s", sourcePath)
	}
	if err := ensureTargetWritable(target, overwrite); err != nil {
		return StorageEntry{}, err
	}
	if overwrite {
		_ = os.RemoveAll(target)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return StorageEntry{}, err
	}
	if err := os.Rename(source, target); err != nil {
		return StorageEntry{}, err
	}
	return p.entry(root, target)
}

func (p *FilesystemProvider) StreamRead(root ResolvedStorageRoot, path string, output io.Writer, onBytes func(int64)) (FileContentInfo, error) {
	return p.StreamReadContext(context.Background(), root, path, output, onBytes)
}

func (p *FilesystemProvider) StreamReadContext(ctx context.Context, root ResolvedStorageRoot, path string, output io.Writer, onBytes func(int64)) (FileContentInfo, error) {
	if err := ctx.Err(); err != nil {
		return FileContentInfo{}, err
	}
	info, err := p.ContentInfo(root, path)
	if err != nil {
		return FileContentInfo{}, err
	}
	target, err := p.resolve(root, path)
	if err != nil {
		return FileContentInfo{}, err
	}
	input, err := os.Open(target)
	if err != nil {
		return FileContentInfo{}, err
	}
	defer input.Close()
	if _, err := copyWithProgress(contextWriter{ctx: ctx, writer: output}, contextReader{ctx: ctx, reader: input}, onBytes); err != nil {
		return FileContentInfo{}, err
	}
	return info, nil
}

func (p *FilesystemProvider) RangeRead(root ResolvedStorageRoot, path string, offset int64, length int64) (io.ReadCloser, FileContentInfo, error) {
	info, err := p.ContentInfo(root, path)
	if err != nil {
		return nil, FileContentInfo{}, err
	}
	size := int64Value(info.Size)
	if offset < 0 || offset >= size {
		return nil, FileContentInfo{}, fmt.Errorf("Range offset %d is outside file size %d", offset, size)
	}
	if length < 0 || offset+length > size {
		length = size - offset
	}
	target, err := p.resolve(root, path)
	if err != nil {
		return nil, FileContentInfo{}, err
	}
	input, err := os.Open(target)
	if err != nil {
		return nil, FileContentInfo{}, err
	}
	if _, err := input.Seek(offset, io.SeekStart); err != nil {
		_ = input.Close()
		return nil, FileContentInfo{}, err
	}
	return &limitedReadCloser{reader: io.LimitReader(input, length), closer: input}, info, nil
}

type limitedReadCloser struct {
	reader io.Reader
	closer io.Closer
}

func (l *limitedReadCloser) Read(p []byte) (int, error) { return l.reader.Read(p) }

func (l *limitedReadCloser) Close() error { return l.closer.Close() }

func (p *FilesystemProvider) StreamWrite(root ResolvedStorageRoot, path string, input io.Reader, info FileContentInfo, overwrite bool, onBytes func(int64)) (StorageEntry, error) {
	return p.StreamWriteContext(context.Background(), root, path, input, info, overwrite, onBytes)
}

func (p *FilesystemProvider) StreamWriteContext(ctx context.Context, root ResolvedStorageRoot, path string, input io.Reader, info FileContentInfo, overwrite bool, onBytes func(int64)) (StorageEntry, error) {
	if err := ctx.Err(); err != nil {
		return StorageEntry{}, err
	}
	if err := ensureWritable(root); err != nil {
		return StorageEntry{}, err
	}
	target, err := p.resolve(root, path)
	if err != nil {
		return StorageEntry{}, err
	}
	if _, err := os.Stat(target); err == nil && !overwrite {
		return StorageEntry{}, errors.New("Target already exists")
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return StorageEntry{}, err
	}
	flag := os.O_CREATE | os.O_WRONLY
	if overwrite {
		flag |= os.O_TRUNC
	} else {
		flag |= os.O_EXCL
	}
	output, err := os.OpenFile(target, flag, 0o644)
	if err != nil {
		return StorageEntry{}, err
	}
	if _, err := copyWithProgress(contextWriter{ctx: ctx, writer: output}, contextReader{ctx: ctx, reader: input}, onBytes); err != nil {
		_ = output.Close()
		if !overwrite {
			_ = os.Remove(target)
		}
		return StorageEntry{}, err
	}
	if err := output.Close(); err != nil {
		return StorageEntry{}, err
	}
	return p.Stat(root, path)
}

func (p *FilesystemProvider) DeleteRecursive(ctx context.Context, root ResolvedStorageRoot, relativePath string, onItem func(DeleteItemEvent)) (DeleteSummary, error) {
	if err := ensureWritable(root); err != nil {
		return DeleteSummary{}, err
	}
	target, err := p.resolve(root, relativePath)
	if err != nil {
		return DeleteSummary{}, err
	}
	base, err := p.base(root)
	if err != nil {
		return DeleteSummary{}, err
	}
	if filepath.Clean(target) == filepath.Clean(base) {
		return DeleteSummary{}, errors.New("Cannot delete storage root")
	}
	if err := ctx.Err(); err != nil {
		return DeleteSummary{}, err
	}
	if _, err := os.Lstat(target); err != nil {
		return DeleteSummary{}, err
	}
	paths := make([]string, 0)
	err = filepath.WalkDir(target, func(current string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		paths = append(paths, current)
		return nil
	})
	if err != nil {
		return DeleteSummary{}, err
	}
	summary := DeleteSummary{Discovered: len(paths)}
	var failures []error
	for idx := len(paths) - 1; idx >= 0; idx-- {
		if err := ctx.Err(); err != nil {
			return summary, errors.Join(append(failures, err)...)
		}
		current := paths[idx]
		info, statErr := os.Lstat(current)
		rel, relErr := filepath.Rel(base, current)
		if relErr != nil {
			rel = relativePath
		}
		normalized := filepath.ToSlash(rel)
		kind := "file"
		var size *int64
		if statErr == nil && info.IsDir() {
			kind = "directory"
		} else if statErr == nil && info.Mode().IsRegular() {
			value := info.Size()
			size = &value
		}
		if onItem != nil {
			onItem(DeleteItemEvent{Path: normalized, Name: filepath.Base(current), Kind: kind, Status: "running", Size: size})
		}
		if statErr == nil {
			statErr = os.Remove(current)
		}
		if statErr != nil {
			summary.Failed++
			failures = append(failures, statErr)
			if onItem != nil {
				onItem(DeleteItemEvent{Path: normalized, Name: filepath.Base(current), Kind: kind, Status: "error", Message: statErr.Error(), Size: size})
			}
			continue
		}
		summary.Deleted++
		if onItem != nil {
			onItem(DeleteItemEvent{Path: normalized, Name: filepath.Base(current), Kind: kind, Status: "completed", Message: "Deleted", Size: size})
		}
	}
	return summary, errors.Join(failures...)
}

var filesystemWatchFallbackInterval = 5 * time.Second

func (p *FilesystemProvider) Watch(root ResolvedStorageRoot, path string, cancel <-chan struct{}) (<-chan FileWatchEvent, error) {
	target, err := p.resolve(root, path)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(target)
	if err != nil {
		return nil, fmt.Errorf("Path does not exist: %s", path)
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("Path is not a regular file: %s", path)
	}
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	// Watch the parent directory so rotation (rename + recreate) and removal
	// of the file itself keep producing events.
	if err := watcher.Add(filepath.Dir(target)); err != nil {
		_ = watcher.Close()
		return nil, err
	}
	events := make(chan FileWatchEvent, 16)
	go func() {
		defer close(events)
		defer watcher.Close()
		state := newWatchState(info.Size(), info.ModTime().String())
		ticker := time.NewTicker(filesystemWatchFallbackInterval)
		defer ticker.Stop()
		check := func() *FileWatchEvent {
			current, err := os.Stat(target)
			if err != nil {
				return state.observeMissing()
			}
			return state.observe(current.Size(), current.ModTime().String())
		}
		for {
			var event *FileWatchEvent
			select {
			case <-cancel:
				return
			case notification, ok := <-watcher.Events:
				if !ok {
					return
				}
				if filepath.Clean(notification.Name) != target {
					continue
				}
				event = check()
			case _, ok := <-watcher.Errors:
				if !ok {
					return
				}
				continue
			case <-ticker.C:
				event = check()
			}
			if event == nil {
				continue
			}
			select {
			case events <- *event:
			case <-cancel:
				return
			}
		}
	}()
	return events, nil
}

func (p *FilesystemProvider) resolve(root ResolvedStorageRoot, relative string) (string, error) {
	base, err := p.base(root)
	if err != nil {
		return "", err
	}
	clean := strings.TrimPrefix(filepath.FromSlash(relative), string(filepath.Separator))
	target := filepath.Clean(filepath.Join(base, clean))
	if err := p.validateInside(root, target); err != nil {
		return "", err
	}
	return target, nil
}

func (p *FilesystemProvider) validateInside(root ResolvedStorageRoot, target string) error {
	base, err := p.base(root)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(base, target)
	if err != nil {
		return err
	}
	if rel == "." || (!strings.HasPrefix(rel, ".."+string(filepath.Separator)) && rel != ".." && !filepath.IsAbs(rel)) {
		return nil
	}
	return errors.New("Path escapes configured storage root")
}

func (p *FilesystemProvider) base(root ResolvedStorageRoot) (string, error) {
	target, ok := root.Target.(FilesystemRootTarget)
	if !ok {
		return "", errors.New("Storage root is not a filesystem root")
	}
	return filepath.Abs(filepath.Clean(target.Path))
}

func (p *FilesystemProvider) entry(root ResolvedStorageRoot, target string) (StorageEntry, error) {
	base, err := p.base(root)
	if err != nil {
		return StorageEntry{}, err
	}
	info, err := os.Stat(target)
	if err != nil {
		return StorageEntry{}, err
	}
	absolute, err := filepath.Abs(filepath.Clean(target))
	if err != nil {
		return StorageEntry{}, err
	}
	relative, err := filepath.Rel(base, absolute)
	if err != nil {
		relative = ""
	}
	if relative == "." {
		relative = ""
	}
	normalized := filepath.ToSlash(relative)
	name := filepath.Base(target)
	if name == "." || name == string(filepath.Separator) {
		name = root.Label
	}
	kind := "other"
	if info.IsDir() {
		kind = "directory"
	} else if info.Mode().IsRegular() {
		kind = "file"
	}
	var size *int64
	if info.Mode().IsRegular() {
		value := info.Size()
		size = &value
	}
	modified := info.ModTime().UTC().Format(time.RFC3339Nano)
	permissions := info.Mode().Perm().String()
	mimeType := p.mimeType(target)
	metadata := emptyMetadata(size, mimeType, nil, &permissions, &modified, name)
	return StorageEntry{
		ID:           root.Tunnel + ":" + root.ID + ":" + normalized,
		Name:         name,
		Path:         normalized,
		Kind:         kind,
		Metadata:     metadata,
		Capabilities: p.Capabilities(root),
		ProviderSpecific: map[string]string{
			"filesystem.path": absolute,
		},
	}, nil
}

func (p *FilesystemProvider) mimeType(target string) *string {
	ext := filepath.Ext(target)
	var detected *string
	if value := mime.TypeByExtension(ext); value != "" {
		trimmed := strings.Split(value, ";")[0]
		detected = &trimmed
	}
	return fallbackMIMEType(filepath.Base(target), detected)
}

func (p *FilesystemProvider) copyPath(source string, target string, overwrite bool) error {
	info, err := os.Stat(source)
	if err != nil {
		return err
	}
	if info.IsDir() {
		if rel, err := filepath.Rel(source, target); err == nil && (rel == "." || (!strings.HasPrefix(rel, "..") && !filepath.IsAbs(rel))) {
			return errors.New("Cannot copy a directory into itself")
		}
		if err := ensureTargetWritable(target, overwrite); err != nil {
			return err
		}
		if err := os.MkdirAll(target, info.Mode().Perm()); err != nil {
			return err
		}
		children, err := os.ReadDir(source)
		if err != nil {
			return err
		}
		for _, child := range children {
			if err := p.copyPath(filepath.Join(source, child.Name()), filepath.Join(target, child.Name()), overwrite); err != nil {
				return err
			}
		}
		return nil
	}
	if !info.Mode().IsRegular() {
		return errors.New("Copy currently supports regular files and directories only")
	}
	return copyFile(source, target, info.Mode().Perm(), overwrite)
}

func copyFile(source string, target string, mode os.FileMode, overwrite bool) error {
	if err := ensureTargetWritable(target, overwrite); err != nil {
		return err
	}
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	flag := os.O_CREATE | os.O_WRONLY
	if overwrite {
		flag |= os.O_TRUNC
	} else {
		flag |= os.O_EXCL
	}
	output, err := os.OpenFile(target, flag, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(output, input); err != nil {
		_ = output.Close()
		return err
	}
	return output.Close()
}

func emptyMetadata(size *int64, mimeType *string, owner *string, permissions *string, modifiedTime *string, fileName string) EntryMetadata {
	classification := classify(fileName, mimeType)
	category := classification.category
	icon := classification.icon
	source := "unknown"
	if mimeType != nil {
		source = "provider"
	} else if classification.mimeType != fallbackType.mimeType {
		source = "extension"
	}
	resolvedMIME := mimeType
	if resolvedMIME == nil && classification.mimeType != "" {
		resolvedMIME = &classification.mimeType
	}
	return EntryMetadata{
		Size:           size,
		MIMEType:       resolvedMIME,
		Owner:          owner,
		Permissions:    permissions,
		ModifiedTime:   modifiedTime,
		Unavailable:    []string{"version", "retention", "encryption"},
		FileCategory:   &category,
		FileIcon:       &icon,
		MIMETypeSource: &source,
	}
}

func ensureWritable(root ResolvedStorageRoot) error {
	if root.ReadOnly {
		return errors.New("Storage root is read-only")
	}
	return nil
}

func ensureTargetWritable(target string, overwrite bool) error {
	if _, err := os.Stat(target); err == nil && !overwrite {
		return errors.New("Target already exists")
	}
	return nil
}

func validName(name string) (string, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "", errors.New("Name cannot be empty")
	}
	if strings.Contains(trimmed, "/") || strings.Contains(trimmed, "\\") {
		return "", errors.New("Name cannot contain path separators")
	}
	return trimmed, nil
}

func joinPath(parentPath string, name string) string {
	parent := strings.TrimSuffix(parentPath, "/")
	if parent == "" {
		return name
	}
	return parent + "/" + name
}

func copyWithProgress(dst io.Writer, src io.Reader, onBytes func(int64)) (int64, error) {
	buffer := make([]byte, 64*1024)
	var written int64
	for {
		read, readErr := src.Read(buffer)
		if read > 0 {
			count, writeErr := dst.Write(buffer[:read])
			written += int64(count)
			if onBytes != nil && count > 0 {
				onBytes(int64(count))
			}
			if writeErr != nil {
				return written, writeErr
			}
			if count != read {
				return written, io.ErrShortWrite
			}
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				return written, nil
			}
			return written, readErr
		}
	}
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(buffer []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	count, err := r.reader.Read(buffer)
	if err == nil {
		err = r.ctx.Err()
	}
	return count, err
}

type contextWriter struct {
	ctx    context.Context
	writer io.Writer
}

func (w contextWriter) Write(buffer []byte) (int, error) {
	if err := w.ctx.Err(); err != nil {
		return 0, err
	}
	count, err := w.writer.Write(buffer)
	if err == nil {
		err = w.ctx.Err()
	}
	return count, err
}
