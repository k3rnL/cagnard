package storage

import "io"

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
	Path      string
	MIMEType  *string
	Content   string
	Truncated bool
}

type StorageProvider interface {
	Descriptor() ProviderDescriptor
	Capabilities(root ResolvedStorageRoot) []CapabilityStatus
	List(root ResolvedStorageRoot, path string) ([]StorageEntry, error)
	Stat(root ResolvedStorageRoot, path string) (StorageEntry, error)
	Download(root ResolvedStorageRoot, path string) (FileContent, error)
	Preview(root ResolvedStorageRoot, path string, maxBytes int64) (TextPreview, error)
	Upload(root ResolvedStorageRoot, path string, bytes []byte, overwrite bool) (StorageEntry, error)
	CreateFolder(root ResolvedStorageRoot, parentPath string, name string) (StorageEntry, error)
	Rename(root ResolvedStorageRoot, path string, newName string) (StorageEntry, error)
	Delete(root ResolvedStorageRoot, path string) error
	Copy(root ResolvedStorageRoot, sourcePath string, targetPath string, overwrite bool) (StorageEntry, error)
	Move(root ResolvedStorageRoot, sourcePath string, targetPath string, overwrite bool) (StorageEntry, error)
	ContentInfo(root ResolvedStorageRoot, path string) (FileContentInfo, error)
	StreamRead(root ResolvedStorageRoot, path string, output io.Writer, onBytes func(int64)) (FileContentInfo, error)
	StreamWrite(root ResolvedStorageRoot, path string, input io.Reader, info FileContentInfo, overwrite bool, onBytes func(int64)) (StorageEntry, error)
}
