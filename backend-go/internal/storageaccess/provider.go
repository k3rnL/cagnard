package storageaccess

import (
	"context"
	"fmt"
	"io"
	"path"
	"strings"
	"sync"

	"github.com/k3rnl/cagnard/backend-go/internal/identity"
	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

// GuardedProvider is the sole API-facing provider adapter. Every operation rechecks
// current policy and the originating authentication deadline, including recursive work.
// Inspection of an operation's source/destination is covered by its required actions.
type GuardedProvider struct {
	storage.StorageProvider
	Check    func(...string) error
	Deadline func(context.Context) (context.Context, context.CancelFunc)
}

func (p *GuardedProvider) List(r storage.ResolvedStorageRoot, s string) ([]storage.StorageEntry, error) {
	if e := p.Check(); e != nil {
		return nil, e
	}
	return p.StorageProvider.List(r, s)
}
func (p *GuardedProvider) ListPage(r storage.ResolvedStorageRoot, s string, o storage.ListOptions) (storage.ListPage, error) {
	if e := p.Check(); e != nil {
		return storage.ListPage{}, e
	}
	return p.StorageProvider.ListPage(r, s, o)
}
func (p *GuardedProvider) Stat(r storage.ResolvedStorageRoot, s string) (storage.StorageEntry, error) {
	if e := p.Check(); e != nil {
		return storage.StorageEntry{}, e
	}
	return p.StorageProvider.Stat(r, s)
}
func (p *GuardedProvider) Download(r storage.ResolvedStorageRoot, s string) (storage.FileContent, error) {
	if e := p.Check(identity.Read); e != nil {
		return storage.FileContent{}, e
	}
	return p.StorageProvider.Download(r, s)
}
func (p *GuardedProvider) Preview(r storage.ResolvedStorageRoot, s string, o, n int64) (storage.TextPreview, error) {
	if e := p.Check(identity.Read); e != nil {
		return storage.TextPreview{}, e
	}
	return p.StorageProvider.Preview(r, s, o, n)
}
func (p *GuardedProvider) ContentInfo(r storage.ResolvedStorageRoot, s string) (storage.FileContentInfo, error) {
	if e := p.Check(identity.Read); e != nil {
		return storage.FileContentInfo{}, e
	}
	return p.StorageProvider.ContentInfo(r, s)
}
func (p *GuardedProvider) Upload(r storage.ResolvedStorageRoot, s string, b []byte, overwrite bool) (storage.StorageEntry, error) {
	if e := p.checkWriteParent(r, s); e != nil {
		return storage.StorageEntry{}, e
	}
	return p.StorageProvider.Upload(r, s, b, overwrite)
}
func (p *GuardedProvider) CreateFolder(r storage.ResolvedStorageRoot, parent, name string) (storage.StorageEntry, error) {
	if e := p.Check(identity.Mkdir); e != nil {
		return storage.StorageEntry{}, e
	}
	return p.StorageProvider.CreateFolder(r, parent, name)
}
func (p *GuardedProvider) Rename(r storage.ResolvedStorageRoot, s, name string) (storage.StorageEntry, error) {
	if e := p.Check(identity.Rename); e != nil {
		return storage.StorageEntry{}, e
	}
	// Rename never silently overwrites another entry. Explicit replacement is a transfer.
	if _, e := p.StorageProvider.Stat(r, path.Join(path.Dir(s), name)); e == nil {
		return storage.StorageEntry{}, fmt.Errorf("target already exists")
	}
	return p.StorageProvider.Rename(r, s, name)
}
func (p *GuardedProvider) Delete(r storage.ResolvedStorageRoot, s string) error {
	_, e := p.DeleteRecursive(context.Background(), r, s, nil)
	return e
}
func (p *GuardedProvider) StreamRead(r storage.ResolvedStorageRoot, s string, w io.Writer, on func(int64)) (storage.FileContentInfo, error) {
	return p.StreamReadContext(context.Background(), r, s, w, on)
}
func (p *GuardedProvider) StreamReadContext(ctx context.Context, r storage.ResolvedStorageRoot, s string, w io.Writer, on func(int64)) (storage.FileContentInfo, error) {
	if e := p.Check(identity.Read); e != nil {
		return storage.FileContentInfo{}, e
	}
	ctx, cancel := p.Deadline(ctx)
	defer cancel()
	return p.StorageProvider.StreamReadContext(ctx, r, s, w, on)
}
func (p *GuardedProvider) StreamWrite(r storage.ResolvedStorageRoot, s string, reader io.Reader, i storage.FileContentInfo, overwrite bool, on func(int64)) (storage.StorageEntry, error) {
	return p.StreamWriteContext(context.Background(), r, s, reader, i, overwrite, on)
}
func (p *GuardedProvider) StreamWriteContext(ctx context.Context, r storage.ResolvedStorageRoot, s string, reader io.Reader, i storage.FileContentInfo, overwrite bool, on func(int64)) (storage.StorageEntry, error) {
	if e := p.checkWriteParent(r, s); e != nil {
		return storage.StorageEntry{}, e
	}
	ctx, cancel := p.Deadline(ctx)
	defer cancel()
	return p.StorageProvider.StreamWriteContext(ctx, r, s, reader, i, overwrite, on)
}

type deadlineReader struct {
	io.ReadCloser
	ctx       context.Context
	cancel    context.CancelFunc
	closeOnce sync.Once
	closeErr  error
}

func (r *deadlineReader) Read(b []byte) (int, error) {
	if e := r.ctx.Err(); e != nil {
		return 0, e
	}
	return r.ReadCloser.Read(b)
}
func (r *deadlineReader) Close() error {
	r.cancel()
	r.closeOnce.Do(func() { r.closeErr = r.ReadCloser.Close() })
	return r.closeErr
}
func (p *GuardedProvider) RangeRead(r storage.ResolvedStorageRoot, s string, o, n int64) (io.ReadCloser, storage.FileContentInfo, error) {
	if e := p.Check(identity.Read); e != nil {
		return nil, storage.FileContentInfo{}, e
	}
	ctx, cancel := p.Deadline(context.Background())
	reader, info, e := p.StorageProvider.RangeRead(r, s, o, n)
	if e != nil {
		cancel()
		return nil, info, e
	}
	result := &deadlineReader{ReadCloser: reader, ctx: ctx, cancel: cancel}
	go func() { <-ctx.Done(); _ = result.Close() }()
	return result, info, nil
}
func (p *GuardedProvider) Watch(r storage.ResolvedStorageRoot, s string, done <-chan struct{}) (<-chan storage.FileWatchEvent, error) {
	if e := p.Check(identity.Read); e != nil {
		return nil, e
	}
	ctx, cancel := p.Deadline(context.Background())
	events, e := p.StorageProvider.Watch(r, s, ctx.Done())
	if e != nil {
		cancel()
		return nil, e
	}
	go func() {
		select {
		case <-done:
		case <-ctx.Done():
		}
		cancel()
	}()
	return events, nil
}
func (p *GuardedProvider) DeleteRecursive(ctx context.Context, r storage.ResolvedStorageRoot, s string, on func(storage.DeleteItemEvent)) (storage.DeleteSummary, error) {
	if e := p.Check(identity.Delete); e != nil {
		return storage.DeleteSummary{}, e
	}
	ctx, cancel := p.Deadline(ctx)
	defer cancel()
	// Providers honor ctx between physical deletion steps. Check current policy at each
	// reported step as well; cancellation cannot roll back already committed effects.
	return p.StorageProvider.DeleteRecursive(ctx, r, s, func(e storage.DeleteItemEvent) {
		if p.Check(identity.Delete) != nil {
			cancel()
		}
		if on != nil {
			on(e)
		}
	})
}
func (p *GuardedProvider) Copy(r storage.ResolvedStorageRoot, source, target string, overwrite bool) (storage.StorageEntry, error) {
	if e := p.Check(identity.Read, identity.Write); e != nil {
		return storage.StorageEntry{}, e
	}
	from, to := path.Clean(strings.Trim(source, "/")), path.Clean(strings.Trim(target, "/"))
	if from == "." || to == "." || from == to || strings.HasPrefix(to, from+"/") || strings.HasPrefix(from, to+"/") {
		return storage.StorageEntry{}, fmt.Errorf("invalid copy target")
	}
	return p.copy(r, source, target, overwrite)
}
func (p *GuardedProvider) copy(r storage.ResolvedStorageRoot, source, target string, overwrite bool) (storage.StorageEntry, error) {
	entry, e := p.Stat(r, source)
	if e != nil {
		return storage.StorageEntry{}, e
	}
	if entry.Kind == "directory" {
		if e = p.Check(identity.Mkdir); e != nil {
			return storage.StorageEntry{}, e
		}
		if _, e = p.Stat(r, target); e == nil {
			if !overwrite {
				return storage.StorageEntry{}, fmt.Errorf("target already exists")
			}
			if e = p.Delete(r, target); e != nil {
				return storage.StorageEntry{}, e
			}
		}
		result, e := p.CreateFolder(r, path.Dir(target), path.Base(target))
		if e != nil {
			return storage.StorageEntry{}, e
		}
		children, e := p.List(r, source)
		if e != nil {
			return result, e
		}
		for _, child := range children {
			if _, e = p.copy(r, child.Path, path.Join(target, child.Name), overwrite); e != nil {
				return result, e
			}
		}
		return result, nil
	}
	reader, info, e := p.RangeRead(r, source, 0, -1)
	if e != nil {
		return storage.StorageEntry{}, e
	}
	defer reader.Close()
	return p.StreamWrite(r, target, reader, info, overwrite, nil)
}
func (p *GuardedProvider) Move(r storage.ResolvedStorageRoot, source, target string, overwrite bool) (storage.StorageEntry, error) {
	if e := p.Check(identity.Read, identity.Write, identity.Delete); e != nil {
		return storage.StorageEntry{}, e
	}
	result, e := p.Copy(r, source, target, overwrite)
	if e != nil {
		return result, e
	}
	return result, p.Delete(r, source)
}

func (p *GuardedProvider) checkWriteParent(r storage.ResolvedStorageRoot, s string) error {
	if e := p.Check(identity.Write); e != nil {
		return e
	}
	parent := path.Dir(s)
	if parent != "." && parent != "/" {
		if _, e := p.StorageProvider.Stat(r, parent); e != nil {
			return p.Check(identity.Mkdir)
		}
	}
	return nil
}

// The compiled HTTP demo serves already-public files. Preserve its optional URL
// capability after the normal read check; filesystem/S3 providers never expose it.
func (p *GuardedProvider) PublicContentURL(r storage.ResolvedStorageRoot, s string) (string, bool) {
	if p.Check(identity.Read) != nil {
		return "", false
	}
	if direct, ok := p.StorageProvider.(interface {
		PublicContentURL(storage.ResolvedStorageRoot, string) (string, bool)
	}); ok {
		return direct.PublicContentURL(r, s)
	}
	return "", false
}
