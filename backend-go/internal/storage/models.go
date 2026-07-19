package storage

import (
	"context"
	"io"
)

type CapabilityStatus struct {
	Name        string
	Status      string
	Description *string
}

type EntryMetadata struct {
	Size           *int64
	MIMEType       *string
	Owner          *string
	Permissions    *string
	ModifiedTime   *string
	Version        *string
	Retention      *string
	Encryption     *string
	Unavailable    []string
	FileCategory   *string
	FileIcon       *string
	MIMETypeSource *string
}

type StorageEntry struct {
	ID               string
	Name             string
	Path             string
	Kind             string
	Metadata         EntryMetadata
	Capabilities     []CapabilityStatus
	ProviderSpecific map[string]string
}

type ListOptions struct {
	PageSize      int
	Cursor        *string
	Query         string
	SortKey       string
	SortDirection string
}

type ListAccuracy struct {
	Search string
	Sort   string
	Total  string
}

type ListPage struct {
	Entries       []StorageEntry
	NextCursor    *string
	TotalCount    *int
	FilteredCount *int
	Accuracy      ListAccuracy
}

type RootTarget interface {
	rootTarget()
}

type FilesystemRootTarget struct {
	Path string
}

func (FilesystemRootTarget) rootTarget() {}

type ObjectStoreRootTarget struct {
	Bucket string
	Prefix string
}

func (ObjectStoreRootTarget) rootTarget() {}

type HTTPRootTarget struct {
	Prefix string
}

func (HTTPRootTarget) rootTarget() {}

type ResolvedStorageRoot struct {
	ID             string
	Label          string
	Tunnel         string
	ProviderID     string
	AccountID      string
	ProviderFamily string
	ReadOnly       bool
	Target         RootTarget
	Settings       map[string]string
}

type ProviderDescriptor struct {
	ID           string
	Family       string
	DisplayName  string
	ProviderType string
}

type FileContent struct {
	FileName string
	MIMEType *string
	Bytes    []byte
}

type FileContentInfo struct {
	FileName string
	MIMEType *string
	Size     *int64
}

type TextPreview struct {
	Path       string
	MIMEType   *string
	Content    string
	Truncated  bool
	Offset     int64
	NextOffset int64
	TotalSize  *int64
}

type DeleteItemEvent struct {
	Path    string
	Name    string
	Kind    string
	Status  string
	Message string
	Size    *int64
}

type DeleteSummary struct {
	Discovered int
	Deleted    int
	Failed     int
}

type StorageProvider interface {
	Descriptor() ProviderDescriptor
	Capabilities(root ResolvedStorageRoot) []CapabilityStatus
	List(root ResolvedStorageRoot, path string) ([]StorageEntry, error)
	ListPage(root ResolvedStorageRoot, path string, options ListOptions) (ListPage, error)
	Stat(root ResolvedStorageRoot, path string) (StorageEntry, error)
	Download(root ResolvedStorageRoot, path string) (FileContent, error)
	// Preview returns up to maxBytes of text content starting at the byte
	// offset. When more content follows, Truncated is true and NextOffset is
	// the rune-aligned offset to continue from.
	Preview(root ResolvedStorageRoot, path string, offset int64, maxBytes int64) (TextPreview, error)
	Upload(root ResolvedStorageRoot, path string, bytes []byte, overwrite bool) (StorageEntry, error)
	CreateFolder(root ResolvedStorageRoot, parentPath string, name string) (StorageEntry, error)
	Rename(root ResolvedStorageRoot, path string, newName string) (StorageEntry, error)
	Delete(root ResolvedStorageRoot, path string) error
	Copy(root ResolvedStorageRoot, sourcePath string, targetPath string, overwrite bool) (StorageEntry, error)
	Move(root ResolvedStorageRoot, sourcePath string, targetPath string, overwrite bool) (StorageEntry, error)
	ContentInfo(root ResolvedStorageRoot, path string) (FileContentInfo, error)
	StreamRead(root ResolvedStorageRoot, path string, output io.Writer, onBytes func(int64)) (FileContentInfo, error)
	StreamReadContext(ctx context.Context, root ResolvedStorageRoot, path string, output io.Writer, onBytes func(int64)) (FileContentInfo, error)
	// RangeRead returns a reader over [offset, offset+length) of the file content.
	// A negative length reads to the end of the file. The returned FileContentInfo
	// reports the total file size, not the range length.
	RangeRead(root ResolvedStorageRoot, path string, offset int64, length int64) (io.ReadCloser, FileContentInfo, error)
	// Watch emits change events for one file until cancel is closed. The
	// returned channel is closed by the provider when watching stops.
	Watch(root ResolvedStorageRoot, path string, cancel <-chan struct{}) (<-chan FileWatchEvent, error)
	StreamWrite(root ResolvedStorageRoot, path string, input io.Reader, info FileContentInfo, overwrite bool, onBytes func(int64)) (StorageEntry, error)
	StreamWriteContext(ctx context.Context, root ResolvedStorageRoot, path string, input io.Reader, info FileContentInfo, overwrite bool, onBytes func(int64)) (StorageEntry, error)
	DeleteRecursive(ctx context.Context, root ResolvedStorageRoot, path string, onItem func(DeleteItemEvent)) (DeleteSummary, error)
}

func int64Value(value *int64) int64 {
	if value == nil {
		return 0
	}
	return *value
}
