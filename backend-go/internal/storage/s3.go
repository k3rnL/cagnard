package storage

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
	smithymiddleware "github.com/aws/smithy-go/middleware"
	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

const defaultMaxBufferedObjectBytes int64 = 64 * 1024 * 1024

type S3StorageProvider struct {
	descriptor ProviderDescriptor
	settings   S3ProviderSettings
	clients    map[string]S3ObjectClient
}

type S3ProviderSettings struct {
	Endpoint                   *string
	Region                     string
	PathStyleAccess            bool
	SSLEnabled                 bool
	TrustAllCertificates       bool
	RequestChecksumCalculation aws.RequestChecksumCalculation
	MaxBufferedObjectBytes     int64
	MaxListPages               int
}

type S3AccountSettings struct {
	CredentialMode  string
	AccessKeyID     *string
	SecretAccessKey *string
	SessionToken    *string
	Profile         *string
}

type S3ObjectClient interface {
	List(bucket string, prefix string, delimiter string, continuationToken *string, maxKeys int32) (S3ListPage, error)
	Head(bucket string, key string) (S3ObjectMetadata, error)
	Exists(bucket string, key string) (bool, error)
	Get(bucket string, key string) (S3ObjectContent, error)
	Put(bucket string, key string, body []byte, contentType *string) (S3ObjectMetadata, error)
	StreamGet(bucket string, key string, output io.Writer, onBytes func(int64)) (S3ObjectMetadata, error)
	RangeGet(bucket string, key string, offset int64, length int64) (io.ReadCloser, S3ObjectMetadata, error)
	StreamPut(bucket string, key string, input io.Reader, info FileContentInfo, contentType *string, onBytes func(int64)) (S3ObjectMetadata, error)
	Copy(bucket string, sourceKey string, targetKey string) (S3ObjectMetadata, error)
	Delete(bucket string, key string) error
}

type S3ListPage struct {
	Objects               []S3ListedObject
	CommonPrefixes        []string
	NextContinuationToken *string
}

type S3ListedObject struct {
	Key          string
	Size         *int64
	ETag         *string
	LastModified *time.Time
	StorageClass *string
}

type S3ObjectMetadata struct {
	Key              string
	Size             *int64
	ContentType      *string
	LastModified     *time.Time
	ETag             *string
	VersionID        *string
	StorageClass     *string
	Encryption       *string
	Retention        *string
	Checksum         *string
	ProviderSpecific map[string]string
}

type S3ObjectContent struct {
	Metadata S3ObjectMetadata
	Bytes    []byte
}

func NewS3StorageProviderFromConfig(provider config.ProviderConfig, accounts []config.StorageAccountConfig) (*S3StorageProvider, error) {
	settings, err := s3ProviderSettingsFromConfig(provider)
	if err != nil {
		return nil, err
	}
	clients := map[string]S3ObjectClient{}
	for _, account := range accounts {
		accountSettings, err := s3AccountSettingsFromConfig(account)
		if err != nil {
			return nil, err
		}
		client, err := NewAwsS3ObjectClient(settings, accountSettings)
		if err != nil {
			return nil, err
		}
		clients[account.ID] = client
	}
	return newS3StorageProvider(provider, settings, clients), nil
}

func newS3StorageProvider(provider config.ProviderConfig, settings S3ProviderSettings, clients map[string]S3ObjectClient) *S3StorageProvider {
	return &S3StorageProvider{
		descriptor: ProviderDescriptor{ID: provider.ID, Family: provider.Family, DisplayName: provider.DisplayName, ProviderType: provider.Type},
		settings:   settings,
		clients:    clients,
	}
}

func (p *S3StorageProvider) Descriptor() ProviderDescriptor {
	return p.descriptor
}

func (p *S3StorageProvider) Capabilities(root ResolvedStorageRoot) []CapabilityStatus {
	return S3Capabilities(root.ReadOnly, false)
}

func (p *S3StorageProvider) List(root ResolvedStorageRoot, path string) ([]StorageEntry, error) {
	target, err := objectTarget(root)
	if err != nil {
		return nil, err
	}
	client, err := p.client(root)
	if err != nil {
		return nil, err
	}
	currentPath, err := normalizeObjectPath(path)
	if err != nil {
		return nil, err
	}
	page, err := p.listAll(client, target.Bucket, keyFor(target, currentPath, true), nil, 0)
	if err != nil {
		return nil, err
	}
	entries := p.entriesFromListing(root, target, page)
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].Kind != entries[j].Kind {
			return entries[i].Kind == "directory"
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
	return entries, nil
}

func (p *S3StorageProvider) ListPage(root ResolvedStorageRoot, path string, options ListOptions) (ListPage, error) {
	target, err := objectTarget(root)
	if err != nil {
		return ListPage{}, err
	}
	client, err := p.client(root)
	if err != nil {
		return ListPage{}, err
	}
	currentPath, err := normalizeObjectPath(path)
	if err != nil {
		return ListPage{}, err
	}
	prefix := keyFor(target, currentPath, true)
	if s3NativeListing(options) {
		page, err := client.List(target.Bucket, prefix, "/", options.Cursor, int32(options.PageSize))
		if err != nil {
			return ListPage{}, err
		}
		entries := p.entriesFromListing(root, target, page)
		SortEntries(entries, "name", "asc")
		return ListPage{
			Entries:    entries,
			NextCursor: page.NextContinuationToken,
			Accuracy:   ExactListAccuracy(false),
		}, nil
	}
	page, err := p.listAll(client, target.Bucket, prefix, nil, 0)
	if err != nil {
		return ListPage{}, err
	}
	entries := p.entriesFromListing(root, target, page)
	return FilterSortAndSliceEntries(entries, options)
}

func (p *S3StorageProvider) Stat(root ResolvedStorageRoot, path string) (StorageEntry, error) {
	target, err := objectTarget(root)
	if err != nil {
		return StorageEntry{}, err
	}
	client, err := p.client(root)
	if err != nil {
		return StorageEntry{}, err
	}
	relative, err := normalizeObjectPath(path)
	if err != nil {
		return StorageEntry{}, err
	}
	if relative == "" {
		return StorageEntry{}, errors.New("Cannot stat S3 storage root")
	}
	key := keyFor(target, relative, false)
	if exists, err := client.Exists(target.Bucket, key); err != nil {
		return StorageEntry{}, err
	} else if exists {
		metadata, err := client.Head(target.Bucket, key)
		if err != nil {
			return StorageEntry{}, err
		}
		return p.fileEntry(root, target, metadata), nil
	}
	markerKey := keyFor(target, relative, true)
	if exists, err := client.Exists(target.Bucket, markerKey); err != nil {
		return StorageEntry{}, err
	} else if exists {
		return p.directoryEntry(root, target, markerKey), nil
	}
	page, err := p.listAll(client, target.Bucket, markerKey, nil, 0)
	if err != nil {
		return StorageEntry{}, err
	}
	if len(page.Objects) > 0 || len(page.CommonPrefixes) > 0 {
		return p.directoryEntry(root, target, markerKey), nil
	}
	return StorageEntry{}, fmt.Errorf("Path does not exist: %s", path)
}

func (p *S3StorageProvider) Download(root ResolvedStorageRoot, path string) (FileContent, error) {
	target, client, relative, err := p.objectRequest(root, path, "Cannot download S3 storage root")
	if err != nil {
		return FileContent{}, err
	}
	key := keyFor(target, relative, false)
	metadata, err := client.Head(target.Bucket, key)
	if err != nil {
		return FileContent{}, err
	}
	if err := p.enforceLimit(root, int64Value(metadata.Size)); err != nil {
		return FileContent{}, err
	}
	content, err := client.Get(target.Bucket, key)
	if err != nil {
		return FileContent{}, err
	}
	return FileContent{FileName: fileName(relative), MIMEType: content.Metadata.ContentType, Bytes: content.Bytes}, nil
}

func (p *S3StorageProvider) ContentInfo(root ResolvedStorageRoot, path string) (FileContentInfo, error) {
	target, client, relative, err := p.objectRequest(root, path, "Cannot inspect S3 storage root")
	if err != nil {
		return FileContentInfo{}, err
	}
	metadata, err := client.Head(target.Bucket, keyFor(target, relative, false))
	if err != nil {
		return FileContentInfo{}, err
	}
	return FileContentInfo{FileName: fileName(relative), MIMEType: metadata.ContentType, Size: metadata.Size}, nil
}

func (p *S3StorageProvider) Preview(root ResolvedStorageRoot, path string, offset int64, maxBytes int64) (TextPreview, error) {
	target, client, relative, err := p.objectRequest(root, path, "Cannot preview S3 storage root")
	if err != nil {
		return TextPreview{}, err
	}
	key := keyFor(target, relative, false)
	metadata, err := client.Head(target.Bucket, key)
	if err != nil {
		return TextPreview{}, err
	}
	if !isTextLike(relative, metadata.ContentType) {
		return TextPreview{}, errors.New("File type is not supported for text preview")
	}
	size := int64Value(metadata.Size)
	// offset == size is a valid position: follow mode polls from EOF and an
	// empty, non-truncated page means "nothing new yet".
	if offset < 0 || offset > size {
		return TextPreview{}, fmt.Errorf("Preview offset %d is outside object size %d", offset, size)
	}
	chunk := []byte{}
	if offset < size {
		want := min(maxBytes, size-offset)
		if err := p.enforceLimit(root, want); err != nil {
			return TextPreview{}, err
		}
		body, _, err := client.RangeGet(target.Bucket, key, offset, want)
		if err != nil {
			return TextPreview{}, err
		}
		defer body.Close()
		if chunk, err = io.ReadAll(body); err != nil {
			return TextPreview{}, err
		}
	}
	return textPreviewPage(relative, metadata.ContentType, chunk, offset, size), nil
}

func (p *S3StorageProvider) Upload(root ResolvedStorageRoot, path string, body []byte, overwrite bool) (StorageEntry, error) {
	if err := ensureWritable(root); err != nil {
		return StorageEntry{}, err
	}
	target, err := objectTarget(root)
	if err != nil {
		return StorageEntry{}, err
	}
	client, err := p.client(root)
	if err != nil {
		return StorageEntry{}, err
	}
	relative, err := normalizeObjectPath(path)
	if err != nil {
		return StorageEntry{}, err
	}
	if relative == "" {
		return StorageEntry{}, errors.New("Upload path cannot be empty")
	}
	if err := p.enforceLimit(root, int64(len(body))); err != nil {
		return StorageEntry{}, err
	}
	key := keyFor(target, relative, false)
	if exists, err := client.Exists(target.Bucket, key); err != nil {
		return StorageEntry{}, err
	} else if exists && !overwrite {
		return StorageEntry{}, errors.New("Target already exists")
	}
	metadata, err := client.Put(target.Bucket, key, body, contentType(relative))
	if err != nil {
		return StorageEntry{}, err
	}
	return p.fileEntry(root, target, metadata), nil
}

func (p *S3StorageProvider) CreateFolder(root ResolvedStorageRoot, parentPath string, name string) (StorageEntry, error) {
	if err := ensureWritable(root); err != nil {
		return StorageEntry{}, err
	}
	target, err := objectTarget(root)
	if err != nil {
		return StorageEntry{}, err
	}
	client, err := p.client(root)
	if err != nil {
		return StorageEntry{}, err
	}
	folderName, err := validName(name)
	if err != nil {
		return StorageEntry{}, err
	}
	parent, err := normalizeObjectPath(parentPath)
	if err != nil {
		return StorageEntry{}, err
	}
	relative := joinPath(parent, folderName)
	markerKey := keyFor(target, relative, true)
	if exists, err := client.Exists(target.Bucket, markerKey); err != nil {
		return StorageEntry{}, err
	} else if exists {
		return StorageEntry{}, errors.New("Target already exists")
	}
	directoryContentType := "application/x-directory"
	if _, err := client.Put(target.Bucket, markerKey, []byte{}, &directoryContentType); err != nil {
		return StorageEntry{}, err
	}
	return p.directoryEntry(root, target, markerKey), nil
}

func (p *S3StorageProvider) Rename(root ResolvedStorageRoot, path string, newName string) (StorageEntry, error) {
	name, err := validName(newName)
	if err != nil {
		return StorageEntry{}, err
	}
	relative, err := normalizeObjectPath(path)
	if err != nil {
		return StorageEntry{}, err
	}
	if relative == "" {
		return StorageEntry{}, errors.New("Cannot rename S3 storage root")
	}
	if strings.HasSuffix(relative, "/") {
		return StorageEntry{}, errors.New("Recursive prefix rename is not supported")
	}
	return p.copyThenMaybeDelete(root, relative, joinPath(parentPath(relative), name), false, true)
}

func (p *S3StorageProvider) Delete(root ResolvedStorageRoot, path string) error {
	if err := ensureWritable(root); err != nil {
		return err
	}
	target, err := objectTarget(root)
	if err != nil {
		return err
	}
	client, err := p.client(root)
	if err != nil {
		return err
	}
	relative, err := normalizeObjectPath(path)
	if err != nil {
		return err
	}
	if relative == "" {
		return errors.New("Cannot delete S3 storage root")
	}
	key := keyFor(target, relative, false)
	if exists, err := client.Exists(target.Bucket, key); err != nil {
		return err
	} else if exists {
		return client.Delete(target.Bucket, key)
	}
	return p.deletePrefix(target, client, relative, path)
}

func (p *S3StorageProvider) Copy(root ResolvedStorageRoot, sourcePath string, targetPath string, overwrite bool) (StorageEntry, error) {
	if err := ensureWritable(root); err != nil {
		return StorageEntry{}, err
	}
	return p.copyThenMaybeDelete(root, sourcePath, targetPath, overwrite, false)
}

func (p *S3StorageProvider) Move(root ResolvedStorageRoot, sourcePath string, targetPath string, overwrite bool) (StorageEntry, error) {
	if err := ensureWritable(root); err != nil {
		return StorageEntry{}, err
	}
	return p.copyThenMaybeDelete(root, sourcePath, targetPath, overwrite, true)
}

func (p *S3StorageProvider) StreamRead(root ResolvedStorageRoot, path string, output io.Writer, onBytes func(int64)) (FileContentInfo, error) {
	target, client, relative, err := p.objectRequest(root, path, "Cannot stream S3 storage root")
	if err != nil {
		return FileContentInfo{}, err
	}
	metadata, err := client.StreamGet(target.Bucket, keyFor(target, relative, false), output, onBytes)
	if err != nil {
		return FileContentInfo{}, err
	}
	return FileContentInfo{FileName: fileName(relative), MIMEType: metadata.ContentType, Size: metadata.Size}, nil
}

func (p *S3StorageProvider) RangeRead(root ResolvedStorageRoot, path string, offset int64, length int64) (io.ReadCloser, FileContentInfo, error) {
	target, client, relative, err := p.objectRequest(root, path, "Cannot read S3 storage root")
	if err != nil {
		return nil, FileContentInfo{}, err
	}
	key := keyFor(target, relative, false)
	metadata, err := client.Head(target.Bucket, key)
	if err != nil {
		return nil, FileContentInfo{}, err
	}
	size := int64Value(metadata.Size)
	if offset < 0 || offset >= size {
		return nil, FileContentInfo{}, fmt.Errorf("Range offset %d is outside object size %d", offset, size)
	}
	if length < 0 || offset+length > size {
		length = size - offset
	}
	body, _, err := client.RangeGet(target.Bucket, key, offset, length)
	if err != nil {
		return nil, FileContentInfo{}, err
	}
	return body, FileContentInfo{FileName: fileName(relative), MIMEType: metadata.ContentType, Size: metadata.Size}, nil
}

var s3WatchPollInterval = 3 * time.Second

func (p *S3StorageProvider) Watch(root ResolvedStorageRoot, path string, cancel <-chan struct{}) (<-chan FileWatchEvent, error) {
	target, client, relative, err := p.objectRequest(root, path, "Cannot watch S3 storage root")
	if err != nil {
		return nil, err
	}
	key := keyFor(target, relative, false)
	metadata, err := client.Head(target.Bucket, key)
	if err != nil {
		return nil, err
	}
	events := make(chan FileWatchEvent, 16)
	go func() {
		defer close(events)
		state := newWatchState(int64Value(metadata.Size), stringPtrValue(metadata.ETag))
		ticker := time.NewTicker(s3WatchPollInterval)
		defer ticker.Stop()
		for {
			select {
			case <-cancel:
				return
			case <-ticker.C:
			}
			var event *FileWatchEvent
			if exists, err := client.Exists(target.Bucket, key); err != nil {
				continue
			} else if !exists {
				event = state.observeMissing()
			} else if current, err := client.Head(target.Bucket, key); err == nil {
				event = state.observe(int64Value(current.Size), stringPtrValue(current.ETag))
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

func (p *S3StorageProvider) StreamWrite(root ResolvedStorageRoot, path string, input io.Reader, info FileContentInfo, overwrite bool, onBytes func(int64)) (StorageEntry, error) {
	if err := ensureWritable(root); err != nil {
		return StorageEntry{}, err
	}
	target, err := objectTarget(root)
	if err != nil {
		return StorageEntry{}, err
	}
	client, err := p.client(root)
	if err != nil {
		return StorageEntry{}, err
	}
	relative, err := normalizeObjectPath(path)
	if err != nil {
		return StorageEntry{}, err
	}
	if relative == "" {
		return StorageEntry{}, errors.New("Upload path cannot be empty")
	}
	key := keyFor(target, relative, false)
	if exists, err := client.Exists(target.Bucket, key); err != nil {
		return StorageEntry{}, err
	} else if exists && !overwrite {
		return StorageEntry{}, errors.New("Target already exists")
	}
	metadata, err := client.StreamPut(target.Bucket, key, input, info, contentType(relative), onBytes)
	if err != nil {
		return StorageEntry{}, err
	}
	return p.fileEntry(root, target, metadata), nil
}

func (p *S3StorageProvider) objectRequest(root ResolvedStorageRoot, path string, emptyMessage string) (ObjectStoreRootTarget, S3ObjectClient, string, error) {
	target, err := objectTarget(root)
	if err != nil {
		return ObjectStoreRootTarget{}, nil, "", err
	}
	client, err := p.client(root)
	if err != nil {
		return ObjectStoreRootTarget{}, nil, "", err
	}
	relative, err := normalizeObjectPath(path)
	if err != nil {
		return ObjectStoreRootTarget{}, nil, "", err
	}
	if relative == "" {
		return ObjectStoreRootTarget{}, nil, "", errors.New(emptyMessage)
	}
	return target, client, relative, nil
}

func (p *S3StorageProvider) copyThenMaybeDelete(root ResolvedStorageRoot, sourcePath string, targetPath string, overwrite bool, deleteSource bool) (StorageEntry, error) {
	target, err := objectTarget(root)
	if err != nil {
		return StorageEntry{}, err
	}
	client, err := p.client(root)
	if err != nil {
		return StorageEntry{}, err
	}
	source, err := normalizeObjectPath(sourcePath)
	if err != nil {
		return StorageEntry{}, err
	}
	destination, err := normalizeObjectPath(targetPath)
	if err != nil {
		return StorageEntry{}, err
	}
	if source == "" || destination == "" {
		return StorageEntry{}, errors.New("Source and target paths are required")
	}
	sourceKey := keyFor(target, source, false)
	targetKey := keyFor(target, destination, false)
	if exists, err := client.Exists(target.Bucket, sourceKey); err != nil {
		return StorageEntry{}, err
	} else if !exists {
		return StorageEntry{}, fmt.Errorf("Path does not exist: %s", sourcePath)
	}
	if exists, err := client.Exists(target.Bucket, targetKey); err != nil {
		return StorageEntry{}, err
	} else if exists && !overwrite {
		return StorageEntry{}, errors.New("Target already exists")
	}
	metadata, err := client.Copy(target.Bucket, sourceKey, targetKey)
	if err != nil {
		return StorageEntry{}, err
	}
	if deleteSource {
		if err := client.Delete(target.Bucket, sourceKey); err != nil {
			return StorageEntry{}, err
		}
	}
	return p.fileEntry(root, target, metadata), nil
}

func (p *S3StorageProvider) deletePrefix(target ObjectStoreRootTarget, client S3ObjectClient, relative string, displayPath string) error {
	markerKey := keyFor(target, relative, true)
	markerExists, err := client.Exists(target.Bucket, markerKey)
	if err != nil {
		return err
	}
	page, err := p.listAll(client, target.Bucket, markerKey, nil, 0)
	if err != nil {
		return err
	}
	if !markerExists && len(page.Objects) == 0 && len(page.CommonPrefixes) == 0 {
		return fmt.Errorf("Path does not exist: %s", displayPath)
	}
	for _, prefix := range page.CommonPrefixes {
		childRelative := strings.TrimSuffix(relativeKey(target, prefix), "/")
		if err := p.deletePrefix(target, client, childRelative, childRelative); err != nil {
			return err
		}
	}
	for _, object := range page.Objects {
		if err := client.Delete(target.Bucket, object.Key); err != nil {
			return err
		}
	}
	if markerExists && !listedObjectContains(page.Objects, markerKey) {
		if err := client.Delete(target.Bucket, markerKey); err != nil {
			return err
		}
	}
	return nil
}

func (p *S3StorageProvider) listAll(client S3ObjectClient, bucket string, prefix string, token *string, pagesSeen int) (S3ListPage, error) {
	if pagesSeen >= p.settings.MaxListPages {
		return S3ListPage{}, fmt.Errorf("S3 listing exceeded configured page limit of %d", p.settings.MaxListPages)
	}
	page, err := client.List(bucket, prefix, "/", token, 0)
	if err != nil {
		return S3ListPage{}, err
	}
	if page.NextContinuationToken == nil || *page.NextContinuationToken == "" {
		return page, nil
	}
	tail, err := p.listAll(client, bucket, prefix, page.NextContinuationToken, pagesSeen+1)
	if err != nil {
		return S3ListPage{}, err
	}
	return S3ListPage{Objects: append(page.Objects, tail.Objects...), CommonPrefixes: append(page.CommonPrefixes, tail.CommonPrefixes...)}, nil
}

func s3NativeListing(options ListOptions) bool {
	sortKey := strings.TrimSpace(options.SortKey)
	if sortKey == "" {
		sortKey = DefaultListSortKey
	}
	sortDirection := strings.TrimSpace(options.SortDirection)
	if sortDirection == "" {
		sortDirection = DefaultListSortDirection
	}
	return strings.TrimSpace(options.Query) == "" && sortKey == "name" && sortDirection == "asc"
}

func (p *S3StorageProvider) entriesFromListing(root ResolvedStorageRoot, target ObjectStoreRootTarget, page S3ListPage) []StorageEntry {
	directories := make([]StorageEntry, 0, len(page.CommonPrefixes))
	directoryPaths := map[string]bool{}
	for _, prefix := range page.CommonPrefixes {
		entry := p.directoryEntry(root, target, prefix)
		directories = append(directories, entry)
		directoryPaths[entry.Path] = true
	}
	files := make([]StorageEntry, 0, len(page.Objects))
	for _, object := range page.Objects {
		if isFolderMarker(object.Key) {
			continue
		}
		if directoryPaths[strings.TrimSuffix(relativeKey(target, object.Key), "/")] {
			continue
		}
		files = append(files, p.fileEntry(root, target, listedObjectMetadata(object)))
	}
	return append(directories, files...)
}

func (p *S3StorageProvider) directoryEntry(root ResolvedStorageRoot, target ObjectStoreRootTarget, key string) StorageEntry {
	relative := strings.TrimSuffix(relativeKey(target, key), "/")
	return StorageEntry{
		ID:   root.Tunnel + ":" + root.ID + ":" + relative,
		Name: fileName(relative),
		Path: relative,
		Kind: "directory",
		Metadata: EntryMetadata{
			Unavailable: []string{"size", "mimeType", "owner", "permissions", "modifiedTime", "version", "retention", "encryption"},
		},
		Capabilities: S3Capabilities(root.ReadOnly, true),
		ProviderSpecific: filteredMap(map[string]string{
			"s3.bucket": target.Bucket,
			"s3.key":    key,
			"s3.prefix": target.Prefix,
		}),
	}
}

func (p *S3StorageProvider) fileEntry(root ResolvedStorageRoot, target ObjectStoreRootTarget, metadata S3ObjectMetadata) StorageEntry {
	relative := relativeKey(target, metadata.Key)
	classification := classify(relative, metadata.ContentType)
	mimeType := metadata.ContentType
	if classification.mimeType != "" {
		mimeType = &classification.mimeType
	}
	category := classification.category
	icon := classification.icon
	source := "unknown"
	if metadata.ContentType != nil && *metadata.ContentType != "" {
		source = "provider"
	} else if classification.mimeType != fallbackType.mimeType {
		source = "extension"
	}
	providerSpecific := map[string]string{
		"s3.bucket": target.Bucket,
		"s3.key":    metadata.Key,
		"s3.prefix": target.Prefix,
	}
	for key, value := range metadata.ProviderSpecific {
		providerSpecific[key] = value
	}
	return StorageEntry{
		ID:   root.Tunnel + ":" + root.ID + ":" + relative,
		Name: fileName(relative),
		Path: relative,
		Kind: "file",
		Metadata: EntryMetadata{
			Size:           metadata.Size,
			MIMEType:       mimeType,
			ModifiedTime:   timePtrString(metadata.LastModified),
			Version:        metadata.VersionID,
			Retention:      metadata.Retention,
			Encryption:     metadata.Encryption,
			Unavailable:    unavailableS3Metadata(metadata),
			FileCategory:   &category,
			FileIcon:       &icon,
			MIMETypeSource: &source,
		},
		Capabilities:     S3Capabilities(root.ReadOnly, false),
		ProviderSpecific: filteredMap(providerSpecific),
	}
}

func (p *S3StorageProvider) client(root ResolvedStorageRoot) (S3ObjectClient, error) {
	client, ok := p.clients[root.AccountID]
	if !ok {
		return nil, errors.New("S3 account client is not configured")
	}
	return client, nil
}

func (p *S3StorageProvider) enforceLimit(root ResolvedStorageRoot, size int64) error {
	limit := p.maxBufferedBytes(root)
	if size > limit {
		return fmt.Errorf("Object exceeds buffered object limit of %d bytes", limit)
	}
	return nil
}

func (p *S3StorageProvider) maxBufferedBytes(root ResolvedStorageRoot) int64 {
	if value, ok := root.Settings["maxBufferedObjectBytes"]; ok {
		if parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64); err == nil && parsed > 0 {
			return parsed
		}
	}
	return p.settings.MaxBufferedObjectBytes
}

func objectTarget(root ResolvedStorageRoot) (ObjectStoreRootTarget, error) {
	target, ok := root.Target.(ObjectStoreRootTarget)
	if !ok {
		return ObjectStoreRootTarget{}, errors.New("Storage root is not an S3 object-store root")
	}
	return target, nil
}

func normalizeObjectPath(path string) (string, error) {
	parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			continue
		}
		if part == "." || part == ".." {
			return "", errors.New("Path escapes configured storage root")
		}
		out = append(out, part)
	}
	return strings.Join(out, "/"), nil
}

func keyFor(target ObjectStoreRootTarget, relativePath string, directory bool) string {
	prefix := strings.TrimSuffix(target.Prefix, "/")
	relative := strings.Trim(strings.TrimPrefix(relativePath, "/"), "/")
	joined := ""
	switch {
	case prefix == "" && relative == "":
	case prefix == "":
		joined = relative
	case relative == "":
		joined = prefix
	default:
		joined = prefix + "/" + relative
	}
	if directory && joined != "" {
		return strings.TrimSuffix(joined, "/") + "/"
	}
	return joined
}

func relativeKey(target ObjectStoreRootTarget, key string) string {
	prefix := strings.TrimSuffix(target.Prefix, "/")
	if prefix == "" {
		return strings.TrimPrefix(key, "/")
	}
	return strings.TrimPrefix(strings.TrimPrefix(key, prefix+"/"), "/")
}

func parentPath(path string) string {
	parts := strings.Split(path, "/")
	if len(parts) <= 1 {
		return ""
	}
	return strings.Join(parts[:len(parts)-1], "/")
}

func fileName(path string) string {
	parts := strings.Split(path, "/")
	for idx := len(parts) - 1; idx >= 0; idx-- {
		if parts[idx] != "" {
			return parts[idx]
		}
	}
	return path
}

func isFolderMarker(key string) bool {
	return strings.HasSuffix(key, "/")
}

func contentType(path string) *string {
	return fallbackMIMEType(path, nil)
}

func unavailableS3Metadata(metadata S3ObjectMetadata) []string {
	out := []string{"owner", "permissions"}
	if metadata.VersionID == nil || *metadata.VersionID == "" {
		out = append(out, "version")
	}
	if metadata.Retention == nil || *metadata.Retention == "" {
		out = append(out, "retention")
	}
	if metadata.Encryption == nil || *metadata.Encryption == "" {
		out = append(out, "encryption")
	}
	return out
}

func listedObjectMetadata(value S3ListedObject) S3ObjectMetadata {
	return S3ObjectMetadata{
		Key:          value.Key,
		Size:         value.Size,
		LastModified: value.LastModified,
		ETag:         value.ETag,
		StorageClass: value.StorageClass,
		ProviderSpecific: filteredMap(map[string]string{
			"s3.etag":         stringPtrValue(value.ETag),
			"s3.storageClass": stringPtrValue(value.StorageClass),
		}),
	}
}

func listedObjectContains(objects []S3ListedObject, key string) bool {
	for _, object := range objects {
		if object.Key == key {
			return true
		}
	}
	return false
}

func int64Value(value *int64) int64 {
	if value == nil {
		return 0
	}
	return *value
}

func timePtrString(value *time.Time) *string {
	if value == nil {
		return nil
	}
	out := value.UTC().Format(time.RFC3339Nano)
	return &out
}

func timeStringValue(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.UTC().Format(time.RFC3339Nano)
}

func stringPtrValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func filteredMap(values map[string]string) map[string]string {
	out := map[string]string{}
	for key, value := range values {
		if value != "" {
			out[key] = value
		}
	}
	return out
}

type progressReader struct {
	reader  io.Reader
	onBytes func(int64)
}

func (r progressReader) Read(p []byte) (int, error) {
	count, err := r.reader.Read(p)
	if count > 0 && r.onBytes != nil {
		r.onBytes(int64(count))
	}
	return count, err
}

func s3ProviderSettingsFromConfig(provider config.ProviderConfig) (S3ProviderSettings, error) {
	region := strings.TrimSpace(provider.Settings["region"])
	if region == "" {
		return S3ProviderSettings{}, fmt.Errorf("providers.%s.settings.region is required", provider.ID)
	}
	sslEnabled := boolSetting(provider.Settings, "sslEnabled", true)
	endpoint := endpointWithScheme(provider.Settings["endpoint"], sslEnabled)
	requestChecksumCalculation, err := requestChecksumCalculationSetting(provider.Settings)
	if err != nil {
		return S3ProviderSettings{}, fmt.Errorf("providers.%s.settings.requestChecksumCalculation %w", provider.ID, err)
	}
	return S3ProviderSettings{
		Endpoint:                   endpoint,
		Region:                     region,
		PathStyleAccess:            boolSetting(provider.Settings, "pathStyleAccess", false) || boolSetting(provider.Settings, "pathStyle", false),
		SSLEnabled:                 sslEnabled,
		TrustAllCertificates:       boolSetting(provider.Settings, "trustAllCertificates", false) || boolSetting(provider.Settings, "insecureTrustAllCertificates", false),
		RequestChecksumCalculation: requestChecksumCalculation,
		MaxBufferedObjectBytes:     positiveInt64Setting(provider.Settings, "maxBufferedObjectBytes", defaultMaxBufferedObjectBytes),
		MaxListPages:               max(1, int(positiveInt64Setting(provider.Settings, "maxListPages", 1000))),
	}, nil
}

func s3AccountSettingsFromConfig(account config.StorageAccountConfig) (S3AccountSettings, error) {
	mode := strings.TrimSpace(account.Settings["credentialMode"])
	if mode == "" {
		mode = strings.TrimSpace(account.AuthMode)
	}
	if mode == "" {
		mode = "static"
	}
	accessKeyID := firstSetting(account.Settings, "accessKeyId", "accessKey", "access_key")
	secretAccessKey := firstSetting(account.Settings, "secretAccessKey", "secretKey", "secret_key")
	sessionToken := firstSetting(account.Settings, "sessionToken", "session_token")
	profile := firstSetting(account.Settings, "profile", "profileName")
	switch mode {
	case "static":
		if accessKeyID == nil {
			return S3AccountSettings{}, fmt.Errorf("accounts.%s.settings.accessKeyId is required for static S3 credentials", account.ID)
		}
		if secretAccessKey == nil {
			return S3AccountSettings{}, fmt.Errorf("accounts.%s.settings.secretAccessKey is required for static S3 credentials", account.ID)
		}
	case "profile":
		if profile == nil {
			return S3AccountSettings{}, fmt.Errorf("accounts.%s.settings.profile is required for S3 profile credentials", account.ID)
		}
	case "default-chain":
	default:
		return S3AccountSettings{}, fmt.Errorf("accounts.%s.settings.credentialMode '%s' is not supported for S3 accounts", account.ID, mode)
	}
	return S3AccountSettings{CredentialMode: mode, AccessKeyID: accessKeyID, SecretAccessKey: secretAccessKey, SessionToken: sessionToken, Profile: profile}, nil
}

func endpointWithScheme(raw string, sslEnabled bool) *string {
	endpoint := strings.TrimSpace(raw)
	if endpoint == "" {
		return nil
	}
	if strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://") {
		return &endpoint
	}
	if sslEnabled {
		endpoint = "https://" + endpoint
	} else {
		endpoint = "http://" + endpoint
	}
	return &endpoint
}

func boolSetting(settings map[string]string, key string, fallback bool) bool {
	value := strings.TrimSpace(settings[key])
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func requestChecksumCalculationSetting(settings map[string]string) (aws.RequestChecksumCalculation, error) {
	value := strings.ToLower(strings.TrimSpace(settings["requestChecksumCalculation"]))
	value = strings.ReplaceAll(value, "-", "_")
	if value == "" {
		return aws.RequestChecksumCalculationWhenRequired, nil
	}
	switch value {
	case "when_required", "required":
		return aws.RequestChecksumCalculationWhenRequired, nil
	case "when_supported", "supported":
		return aws.RequestChecksumCalculationWhenSupported, nil
	default:
		return aws.RequestChecksumCalculationUnset, fmt.Errorf("must be 'when_required' or 'when_supported'")
	}
}

func positiveInt64Setting(settings map[string]string, key string, fallback int64) int64 {
	value := strings.TrimSpace(settings[key])
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func firstSetting(settings map[string]string, keys ...string) *string {
	for _, key := range keys {
		if value := strings.TrimSpace(settings[key]); value != "" {
			return &value
		}
	}
	return nil
}

type AwsS3ObjectClient struct {
	client *s3.Client
}

func NewAwsS3ObjectClient(provider S3ProviderSettings, account S3AccountSettings) (*AwsS3ObjectClient, error) {
	options := []func(*awscfg.LoadOptions) error{awscfg.WithRegion(provider.Region)}
	switch account.CredentialMode {
	case "static":
		options = append(options, awscfg.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(stringPtrValue(account.AccessKeyID), stringPtrValue(account.SecretAccessKey), stringPtrValue(account.SessionToken))))
	case "profile":
		options = append(options, awscfg.WithSharedConfigProfile(stringPtrValue(account.Profile)))
	case "default-chain":
	default:
		return nil, fmt.Errorf("Unsupported S3 credential mode '%s'", account.CredentialMode)
	}
	awsConfig, err := awscfg.LoadDefaultConfig(context.Background(), options...)
	if err != nil {
		return nil, safeS3Error(err)
	}
	requestChecksumCalculation := provider.RequestChecksumCalculation
	if requestChecksumCalculation == aws.RequestChecksumCalculationUnset {
		requestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
	}
	client := s3.NewFromConfig(awsConfig, func(options *s3.Options) {
		options.UsePathStyle = provider.PathStyleAccess
		options.RequestChecksumCalculation = requestChecksumCalculation
		if provider.Endpoint != nil {
			options.BaseEndpoint = provider.Endpoint
		}
		if provider.TrustAllCertificates {
			options.HTTPClient = &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}
		}
	})
	return &AwsS3ObjectClient{client: client}, nil
}

func (c *AwsS3ObjectClient) List(bucket string, prefix string, delimiter string, continuationToken *string, maxKeys int32) (S3ListPage, error) {
	input := &s3.ListObjectsV2Input{Bucket: &bucket, Prefix: &prefix, Delimiter: &delimiter, ContinuationToken: continuationToken}
	if maxKeys > 0 {
		input.MaxKeys = &maxKeys
	}
	out, err := c.client.ListObjectsV2(context.Background(), input)
	if err != nil {
		return S3ListPage{}, safeS3Error(err)
	}
	objects := make([]S3ListedObject, 0, len(out.Contents))
	for _, object := range out.Contents {
		objects = append(objects, S3ListedObject{
			Key:          stringPtrValue(object.Key),
			Size:         object.Size,
			ETag:         object.ETag,
			LastModified: object.LastModified,
			StorageClass: aws.String(string(object.StorageClass)),
		})
	}
	prefixes := make([]string, 0, len(out.CommonPrefixes))
	for _, prefix := range out.CommonPrefixes {
		prefixes = append(prefixes, stringPtrValue(prefix.Prefix))
	}
	return S3ListPage{Objects: objects, CommonPrefixes: prefixes, NextContinuationToken: out.NextContinuationToken}, nil
}

func (c *AwsS3ObjectClient) Head(bucket string, key string) (S3ObjectMetadata, error) {
	out, err := c.client.HeadObject(context.Background(), &s3.HeadObjectInput{Bucket: &bucket, Key: &key})
	if err != nil {
		return S3ObjectMetadata{}, safeS3Error(err)
	}
	return metadataFromHead(key, out), nil
}

func (c *AwsS3ObjectClient) Exists(bucket string, key string) (bool, error) {
	_, err := c.client.HeadObject(context.Background(), &s3.HeadObjectInput{Bucket: &bucket, Key: &key})
	if err == nil {
		return true, nil
	}
	if isS3NotFound(err) {
		return false, nil
	}
	return false, safeS3Error(err)
}

func (c *AwsS3ObjectClient) Get(bucket string, key string) (S3ObjectContent, error) {
	out, err := c.client.GetObject(context.Background(), &s3.GetObjectInput{Bucket: &bucket, Key: &key})
	if err != nil {
		return S3ObjectContent{}, safeS3Error(err)
	}
	defer out.Body.Close()
	body, err := io.ReadAll(out.Body)
	if err != nil {
		return S3ObjectContent{}, err
	}
	return S3ObjectContent{Metadata: metadataFromGet(key, out), Bytes: body}, nil
}

func (c *AwsS3ObjectClient) Put(bucket string, key string, body []byte, contentType *string) (S3ObjectMetadata, error) {
	_, err := c.client.PutObject(context.Background(), &s3.PutObjectInput{Bucket: &bucket, Key: &key, Body: bytes.NewReader(body), ContentType: contentType})
	if err != nil {
		return S3ObjectMetadata{}, safeS3Error(err)
	}
	return c.Head(bucket, key)
}

func (c *AwsS3ObjectClient) StreamGet(bucket string, key string, output io.Writer, onBytes func(int64)) (S3ObjectMetadata, error) {
	out, err := c.client.GetObject(context.Background(), &s3.GetObjectInput{Bucket: &bucket, Key: &key})
	if err != nil {
		return S3ObjectMetadata{}, safeS3Error(err)
	}
	defer out.Body.Close()
	if _, err := copyWithProgress(output, out.Body, onBytes); err != nil {
		return S3ObjectMetadata{}, err
	}
	return metadataFromGet(key, out), nil
}

func (c *AwsS3ObjectClient) RangeGet(bucket string, key string, offset int64, length int64) (io.ReadCloser, S3ObjectMetadata, error) {
	rangeSpec := fmt.Sprintf("bytes=%d-", offset)
	if length >= 0 {
		rangeSpec = fmt.Sprintf("bytes=%d-%d", offset, offset+length-1)
	}
	out, err := c.client.GetObject(context.Background(), &s3.GetObjectInput{Bucket: &bucket, Key: &key, Range: &rangeSpec})
	if err != nil {
		return nil, S3ObjectMetadata{}, safeS3Error(err)
	}
	return out.Body, metadataFromGet(key, out), nil
}

func (c *AwsS3ObjectClient) StreamPut(bucket string, key string, input io.Reader, info FileContentInfo, contentType *string, onBytes func(int64)) (S3ObjectMetadata, error) {
	body := progressReader{reader: input, onBytes: onBytes}
	put := &s3.PutObjectInput{Bucket: &bucket, Key: &key, Body: body, ContentType: contentType}
	if info.Size != nil {
		put.ContentLength = info.Size
	}
	_, err := c.client.PutObject(context.Background(), put, s3.WithAPIOptions(useUnsignedPayload))
	if err != nil {
		return S3ObjectMetadata{}, safeS3Error(err)
	}
	return c.Head(bucket, key)
}

func useUnsignedPayload(stack *smithymiddleware.Stack) error {
	v4.RemoveContentSHA256HeaderMiddleware(stack)
	v4.RemoveComputePayloadSHA256Middleware(stack)
	return v4.AddUnsignedPayloadMiddleware(stack)
}

func (c *AwsS3ObjectClient) Copy(bucket string, sourceKey string, targetKey string) (S3ObjectMetadata, error) {
	copySource := url.PathEscape(bucket + "/" + sourceKey)
	_, err := c.client.CopyObject(context.Background(), &s3.CopyObjectInput{Bucket: &bucket, Key: &targetKey, CopySource: &copySource})
	if err != nil {
		return S3ObjectMetadata{}, safeS3Error(err)
	}
	return c.Head(bucket, targetKey)
}

func (c *AwsS3ObjectClient) Delete(bucket string, key string) error {
	_, err := c.client.DeleteObject(context.Background(), &s3.DeleteObjectInput{Bucket: &bucket, Key: &key})
	if err != nil {
		return safeS3Error(err)
	}
	return nil
}

func metadataFromHead(key string, out *s3.HeadObjectOutput) S3ObjectMetadata {
	encryption := enumString(out.ServerSideEncryption)
	retention := firstNonEmpty(string(out.ObjectLockMode), timeStringValue(out.ObjectLockRetainUntilDate))
	checksum := firstNonEmpty(stringPtrValue(out.ChecksumSHA256), stringPtrValue(out.ChecksumSHA1), stringPtrValue(out.ChecksumCRC32), stringPtrValue(out.ChecksumCRC32C))
	versionID := out.VersionId
	storageClass := enumString(out.StorageClass)
	return S3ObjectMetadata{
		Key:          key,
		Size:         out.ContentLength,
		ContentType:  out.ContentType,
		LastModified: out.LastModified,
		ETag:         out.ETag,
		VersionID:    versionID,
		StorageClass: storageClass,
		Encryption:   encryption,
		Retention:    retention,
		Checksum:     checksum,
		ProviderSpecific: filteredMap(map[string]string{
			"s3.etag":           stringPtrValue(out.ETag),
			"s3.storageClass":   stringPtrValue(storageClass),
			"s3.checksum":       stringPtrValue(checksum),
			"s3.objectLockMode": string(out.ObjectLockMode),
			"s3.versionId":      stringPtrValue(versionID),
		}),
	}
}

func metadataFromGet(key string, out *s3.GetObjectOutput) S3ObjectMetadata {
	encryption := enumString(out.ServerSideEncryption)
	retention := firstNonEmpty(string(out.ObjectLockMode), timeStringValue(out.ObjectLockRetainUntilDate))
	checksum := firstNonEmpty(stringPtrValue(out.ChecksumSHA256), stringPtrValue(out.ChecksumSHA1), stringPtrValue(out.ChecksumCRC32), stringPtrValue(out.ChecksumCRC32C))
	versionID := out.VersionId
	storageClass := enumString(out.StorageClass)
	return S3ObjectMetadata{
		Key:          key,
		Size:         out.ContentLength,
		ContentType:  out.ContentType,
		LastModified: out.LastModified,
		ETag:         out.ETag,
		VersionID:    versionID,
		StorageClass: storageClass,
		Encryption:   encryption,
		Retention:    retention,
		Checksum:     checksum,
		ProviderSpecific: filteredMap(map[string]string{
			"s3.etag":           stringPtrValue(out.ETag),
			"s3.storageClass":   stringPtrValue(storageClass),
			"s3.checksum":       stringPtrValue(checksum),
			"s3.objectLockMode": string(out.ObjectLockMode),
			"s3.versionId":      stringPtrValue(versionID),
		}),
	}
}

func enumString[T ~string](value T) *string {
	text := string(value)
	if text == "" {
		return nil
	}
	return &text
}

func firstNonEmpty(values ...string) *string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return &value
		}
	}
	return nil
}

func safeS3Error(err error) error {
	message := err.Error()
	if len(message) > 500 {
		message = message[:500]
	}
	return fmt.Errorf("%T: %s", err, message)
}

func isS3NotFound(err error) bool {
	var noSuchKey *types.NoSuchKey
	if errors.As(err, &noSuchKey) {
		return true
	}
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		code := apiErr.ErrorCode()
		return code == "NotFound" || code == "NoSuchKey" || code == "404"
	}
	return false
}
