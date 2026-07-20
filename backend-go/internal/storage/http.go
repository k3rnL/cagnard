package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

const httpManifestMaxBytes = 8 * 1024 * 1024

var errHTTPReadOnly = errors.New("HTTP storage is read-only")

// HTTPStorageProvider serves a static file tree published on an HTTP origin.
// Listings and stat come from a generated manifest fetched once from the
// origin; content reads are plain or ranged GET requests. The provider is
// structurally read-only.
type HTTPStorageProvider struct {
	descriptor  ProviderDescriptor
	baseURL     string
	manifestURL string
	client      *http.Client

	mu       sync.Mutex
	loaded   bool
	index    map[string]httpManifestEntry
	children map[string][]string
}

type httpManifest struct {
	Version int                 `json:"version"`
	Entries []httpManifestEntry `json:"entries"`
}

type httpManifestEntry struct {
	Path         string `json:"path"`
	Kind         string `json:"kind"`
	Size         *int64 `json:"size,omitempty"`
	ModifiedTime string `json:"modifiedTime,omitempty"`
}

func NewHTTPStorageProviderFromConfig(cfg config.ProviderConfig) (*HTTPStorageProvider, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.Settings["baseUrl"]), "/")
	if baseURL == "" {
		return nil, fmt.Errorf("http provider '%s' requires a baseUrl setting", cfg.ID)
	}
	manifestURL := strings.TrimSpace(cfg.Settings["manifestUrl"])
	if manifestURL == "" {
		manifestURL = baseURL + "/manifest.json"
	}
	return &HTTPStorageProvider{
		descriptor: ProviderDescriptor{
			ID:           cfg.ID,
			Family:       cfg.Family,
			DisplayName:  cfg.DisplayName,
			ProviderType: "http",
		},
		baseURL:     baseURL,
		manifestURL: manifestURL,
		client:      &http.Client{},
	}, nil
}

func (p *HTTPStorageProvider) Descriptor() ProviderDescriptor {
	return p.descriptor
}

func (p *HTTPStorageProvider) Capabilities(root ResolvedStorageRoot) []CapabilityStatus {
	return HTTPCapabilities()
}

func (p *HTTPStorageProvider) List(root ResolvedStorageRoot, relative string) ([]StorageEntry, error) {
	if err := p.ensureManifest(); err != nil {
		return nil, err
	}
	target, err := p.resolve(root, relative)
	if err != nil {
		return nil, err
	}
	if target != "" {
		entry, ok := p.index[target]
		if !ok {
			return nil, fmt.Errorf("Path does not exist: %s", relative)
		}
		if entry.Kind != "directory" {
			return nil, fmt.Errorf("Path is not a directory: %s", relative)
		}
	}
	out := make([]StorageEntry, 0, len(p.children[target]))
	for _, childPath := range p.children[target] {
		out = append(out, p.entry(root, p.index[childPath]))
	}
	return out, nil
}

func (p *HTTPStorageProvider) ListPage(root ResolvedStorageRoot, relative string, options ListOptions) (ListPage, error) {
	entries, err := p.List(root, relative)
	if err != nil {
		return ListPage{}, err
	}
	return FilterSortAndSliceEntries(entries, options)
}

func (p *HTTPStorageProvider) Stat(root ResolvedStorageRoot, relative string) (StorageEntry, error) {
	if err := p.ensureManifest(); err != nil {
		return StorageEntry{}, err
	}
	target, err := p.resolve(root, relative)
	if err != nil {
		return StorageEntry{}, err
	}
	if target == "" {
		return p.rootEntry(root), nil
	}
	entry, ok := p.index[target]
	if !ok {
		return StorageEntry{}, fmt.Errorf("Path does not exist: %s", relative)
	}
	return p.entry(root, entry), nil
}

func (p *HTTPStorageProvider) Download(root ResolvedStorageRoot, relative string) (FileContent, error) {
	info, err := p.ContentInfo(root, relative)
	if err != nil {
		return FileContent{}, err
	}
	target, err := p.resolve(root, relative)
	if err != nil {
		return FileContent{}, err
	}
	response, err := p.get(p.contentURL(target), "")
	if err != nil {
		return FileContent{}, err
	}
	defer response.Body.Close()
	bytes, err := io.ReadAll(response.Body)
	if err != nil {
		return FileContent{}, err
	}
	return FileContent{FileName: info.FileName, MIMEType: info.MIMEType, Bytes: bytes}, nil
}

func (p *HTTPStorageProvider) ContentInfo(root ResolvedStorageRoot, relative string) (FileContentInfo, error) {
	if err := p.ensureManifest(); err != nil {
		return FileContentInfo{}, err
	}
	target, err := p.resolve(root, relative)
	if err != nil {
		return FileContentInfo{}, err
	}
	entry, ok := p.index[target]
	if !ok {
		return FileContentInfo{}, fmt.Errorf("Path does not exist: %s", relative)
	}
	if entry.Kind != "file" {
		return FileContentInfo{}, fmt.Errorf("Path is not a regular file: %s", relative)
	}
	name := path.Base(entry.Path)
	return FileContentInfo{FileName: name, MIMEType: MIMETypeFor(name), Size: entry.Size}, nil
}

func (p *HTTPStorageProvider) Preview(root ResolvedStorageRoot, relative string, offset int64, maxBytes int64) (TextPreview, error) {
	info, err := p.ContentInfo(root, relative)
	if err != nil {
		return TextPreview{}, err
	}
	if !isTextLike(info.FileName, info.MIMEType) {
		return TextPreview{}, errors.New("File type is not supported for text preview")
	}
	size := int64Value(info.Size)
	// offset == size is a valid position: follow mode polls from EOF and an
	// empty, non-truncated page means "nothing new yet".
	if offset < 0 || offset > size {
		return TextPreview{}, fmt.Errorf("Preview offset %d is outside file size %d", offset, size)
	}
	if offset == size {
		return textPreviewPage(relative, info.MIMEType, nil, offset, size), nil
	}
	reader, _, err := p.RangeRead(root, relative, offset, maxBytes)
	if err != nil {
		return TextPreview{}, err
	}
	defer reader.Close()
	chunk, err := io.ReadAll(reader)
	if err != nil {
		return TextPreview{}, err
	}
	return textPreviewPage(relative, info.MIMEType, chunk, offset, size), nil
}

func (p *HTTPStorageProvider) RangeRead(root ResolvedStorageRoot, relative string, offset int64, length int64) (io.ReadCloser, FileContentInfo, error) {
	info, err := p.ContentInfo(root, relative)
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
	target, err := p.resolve(root, relative)
	if err != nil {
		return nil, FileContentInfo{}, err
	}
	rangeHeader := fmt.Sprintf("bytes=%d-%d", offset, offset+length-1)
	response, err := p.get(p.contentURL(target), rangeHeader)
	if err != nil {
		return nil, FileContentInfo{}, err
	}
	if response.StatusCode == http.StatusPartialContent && rangeOverExpectedEntity(response, size) {
		return &limitedReadCloser{reader: io.LimitReader(response.Body, length), closer: response.Body}, info, nil
	}
	if response.StatusCode == http.StatusPartialContent {
		// CDNs that compress on the fly may range over the compressed
		// representation (a Content-Range total unlike the file size, or a
		// Content-Encoding marker). Those bytes are useless as a slice;
		// re-fetch whole so the transport decodes, and slice locally.
		_ = response.Body.Close()
		response, err = p.get(p.contentURL(target), "")
		if err != nil {
			return nil, FileContentInfo{}, err
		}
	}
	// Full-body response: discard the prefix locally so non-range origins
	// stay usable.
	if _, err := io.CopyN(io.Discard, response.Body, offset); err != nil {
		_ = response.Body.Close()
		return nil, FileContentInfo{}, err
	}
	return &limitedReadCloser{reader: io.LimitReader(response.Body, length), closer: response.Body}, info, nil
}

// rangeOverExpectedEntity reports whether a 206 response slices the raw file
// rather than some other representation of it (e.g. a compressed entity).
func rangeOverExpectedEntity(response *http.Response, expectedSize int64) bool {
	if response.Header.Get("Content-Encoding") != "" {
		return false
	}
	contentRange := response.Header.Get("Content-Range")
	slash := strings.LastIndex(contentRange, "/")
	if slash < 0 {
		return true
	}
	total, err := strconv.ParseInt(strings.TrimSpace(contentRange[slash+1:]), 10, 64)
	if err != nil {
		// An unparsable or "*" total says nothing about the representation.
		return true
	}
	return total == expectedSize
}

func (p *HTTPStorageProvider) StreamRead(root ResolvedStorageRoot, relative string, output io.Writer, onBytes func(int64)) (FileContentInfo, error) {
	return p.StreamReadContext(context.Background(), root, relative, output, onBytes)
}

func (p *HTTPStorageProvider) StreamReadContext(ctx context.Context, root ResolvedStorageRoot, relative string, output io.Writer, onBytes func(int64)) (FileContentInfo, error) {
	if err := ctx.Err(); err != nil {
		return FileContentInfo{}, err
	}
	info, err := p.ContentInfo(root, relative)
	if err != nil {
		return FileContentInfo{}, err
	}
	target, err := p.resolve(root, relative)
	if err != nil {
		return FileContentInfo{}, err
	}
	response, err := p.get(p.contentURL(target), "")
	if err != nil {
		return FileContentInfo{}, err
	}
	defer response.Body.Close()
	if _, err := copyWithProgress(contextWriter{ctx: ctx, writer: output}, contextReader{ctx: ctx, reader: response.Body}, onBytes); err != nil {
		return FileContentInfo{}, err
	}
	return info, nil
}

func (p *HTTPStorageProvider) Upload(root ResolvedStorageRoot, relative string, bytes []byte, overwrite bool) (StorageEntry, error) {
	return StorageEntry{}, errHTTPReadOnly
}

func (p *HTTPStorageProvider) CreateFolder(root ResolvedStorageRoot, parentPath string, name string) (StorageEntry, error) {
	return StorageEntry{}, errHTTPReadOnly
}

func (p *HTTPStorageProvider) Rename(root ResolvedStorageRoot, relative string, newName string) (StorageEntry, error) {
	return StorageEntry{}, errHTTPReadOnly
}

func (p *HTTPStorageProvider) Delete(root ResolvedStorageRoot, relative string) error {
	return errHTTPReadOnly
}

func (p *HTTPStorageProvider) Copy(root ResolvedStorageRoot, sourcePath string, targetPath string, overwrite bool) (StorageEntry, error) {
	return StorageEntry{}, errHTTPReadOnly
}

func (p *HTTPStorageProvider) Move(root ResolvedStorageRoot, sourcePath string, targetPath string, overwrite bool) (StorageEntry, error) {
	return StorageEntry{}, errHTTPReadOnly
}

func (p *HTTPStorageProvider) StreamWrite(root ResolvedStorageRoot, relative string, input io.Reader, info FileContentInfo, overwrite bool, onBytes func(int64)) (StorageEntry, error) {
	return StorageEntry{}, errHTTPReadOnly
}

func (p *HTTPStorageProvider) StreamWriteContext(ctx context.Context, root ResolvedStorageRoot, relative string, input io.Reader, info FileContentInfo, overwrite bool, onBytes func(int64)) (StorageEntry, error) {
	return StorageEntry{}, errHTTPReadOnly
}

func (p *HTTPStorageProvider) DeleteRecursive(ctx context.Context, root ResolvedStorageRoot, relative string, onItem func(DeleteItemEvent)) (DeleteSummary, error) {
	return DeleteSummary{}, errHTTPReadOnly
}

func (p *HTTPStorageProvider) Watch(root ResolvedStorageRoot, relative string, cancel <-chan struct{}) (<-chan FileWatchEvent, error) {
	return nil, errors.New("watch is not supported on static HTTP origins")
}

// DirectContentBase exposes the provider's public origin so capable clients
// can read content without proxying through the backend. Worker-based
// readers rely on this: service workers cannot intercept their synchronous
// requests in every browser.
func (p *HTTPStorageProvider) DirectContentBase() string {
	return p.baseURL
}

// PublicContentURL translates a root-relative path into the provider's
// public URL for direct client reads.
func (p *HTTPStorageProvider) PublicContentURL(root ResolvedStorageRoot, relative string) (string, bool) {
	target, err := p.resolve(root, relative)
	if err != nil || target == "" {
		return "", false
	}
	return p.contentURL(target), true
}

func (p *HTTPStorageProvider) ensureManifest() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.loaded {
		return nil
	}
	response, err := p.get(p.manifestURL, "")
	if err != nil {
		return fmt.Errorf("HTTP storage manifest is unavailable: %w", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, httpManifestMaxBytes))
	if err != nil {
		return fmt.Errorf("HTTP storage manifest is unavailable: %w", err)
	}
	var manifest httpManifest
	if err := json.Unmarshal(body, &manifest); err != nil {
		return fmt.Errorf("HTTP storage manifest is invalid: %w", err)
	}
	index := map[string]httpManifestEntry{}
	children := map[string][]string{}
	for _, entry := range manifest.Entries {
		normalized := normalizeHTTPPath(entry.Path)
		if normalized == "" {
			continue
		}
		entry.Path = normalized
		index[normalized] = entry
	}
	// Derive any parent directories the generator did not list explicitly.
	for entryPath := range index {
		for parent := path.Dir(entryPath); parent != "."; parent = path.Dir(parent) {
			if _, ok := index[parent]; !ok {
				index[parent] = httpManifestEntry{Path: parent, Kind: "directory"}
			}
		}
	}
	for entryPath := range index {
		parent := path.Dir(entryPath)
		if parent == "." {
			parent = ""
		}
		children[parent] = append(children[parent], entryPath)
	}
	for parent := range children {
		sort.Strings(children[parent])
	}
	p.index = index
	p.children = children
	p.loaded = true
	return nil
}

func (p *HTTPStorageProvider) resolve(root ResolvedStorageRoot, relative string) (string, error) {
	target, ok := root.Target.(HTTPRootTarget)
	if !ok {
		return "", errors.New("Storage root is not an http root")
	}
	cleaned := normalizeHTTPPath(relative)
	for _, segment := range strings.Split(cleaned, "/") {
		if segment == ".." || segment == "." {
			return "", errors.New("Path escapes configured storage root")
		}
	}
	if target.Prefix == "" {
		return cleaned, nil
	}
	if cleaned == "" {
		return target.Prefix, nil
	}
	return target.Prefix + "/" + cleaned, nil
}

// rootRelative translates a manifest path back into the root-relative form
// used by API responses.
func (p *HTTPStorageProvider) rootRelative(root ResolvedStorageRoot, manifestPath string) string {
	target, ok := root.Target.(HTTPRootTarget)
	if !ok || target.Prefix == "" {
		return manifestPath
	}
	return strings.TrimPrefix(strings.TrimPrefix(manifestPath, target.Prefix), "/")
}

func (p *HTTPStorageProvider) entry(root ResolvedStorageRoot, manifest httpManifestEntry) StorageEntry {
	relative := p.rootRelative(root, manifest.Path)
	name := path.Base(manifest.Path)
	kind := manifest.Kind
	if kind != "directory" && kind != "file" {
		kind = "other"
	}
	var size *int64
	var mimeType *string
	if kind == "file" {
		size = manifest.Size
		mimeType = MIMETypeFor(name)
	}
	var modified *string
	if manifest.ModifiedTime != "" {
		modified = &manifest.ModifiedTime
	}
	return StorageEntry{
		ID:           root.Tunnel + ":" + root.ID + ":" + relative,
		Name:         name,
		Path:         relative,
		Kind:         kind,
		Metadata:     emptyMetadata(size, mimeType, nil, nil, modified, name),
		Capabilities: p.Capabilities(root),
		ProviderSpecific: map[string]string{
			"http.url": p.contentURL(manifest.Path),
		},
	}
}

func (p *HTTPStorageProvider) rootEntry(root ResolvedStorageRoot) StorageEntry {
	return StorageEntry{
		ID:           root.Tunnel + ":" + root.ID + ":",
		Name:         root.Label,
		Path:         "",
		Kind:         "directory",
		Metadata:     emptyMetadata(nil, nil, nil, nil, nil, root.Label),
		Capabilities: p.Capabilities(root),
	}
}

func normalizeHTTPPath(raw string) string {
	parts := strings.Split(raw, "/")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part != "" {
			out = append(out, part)
		}
	}
	return strings.Join(out, "/")
}

func (p *HTTPStorageProvider) contentURL(manifestPath string) string {
	segments := strings.Split(manifestPath, "/")
	escaped := make([]string, 0, len(segments))
	for _, segment := range segments {
		escaped = append(escaped, url.PathEscape(segment))
	}
	return p.baseURL + "/" + strings.Join(escaped, "/")
}

func (p *HTTPStorageProvider) get(target string, rangeHeader string) (*http.Response, error) {
	request, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	if rangeHeader != "" {
		request.Header.Set("Range", rangeHeader)
	}
	response, err := p.client.Do(request)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusPartialContent {
		_ = response.Body.Close()
		return nil, fmt.Errorf("HTTP storage origin returned status %d for %s", response.StatusCode, target)
	}
	return response, nil
}
