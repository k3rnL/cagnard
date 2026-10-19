package storageaccess

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
	"github.com/k3rnl/cagnard/backend-go/internal/identity"
	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

func guardedFilesystem(t *testing.T, check func(...string) error) (*GuardedProvider, storage.ResolvedStorageRoot, string) {
	t.Helper()
	base := t.TempDir()
	return &GuardedProvider{StorageProvider: storage.NewFilesystemProvider(config.ProviderConfig{ID: "fs", Type: "filesystem"}), Check: check, Deadline: context.WithCancel}, storage.ResolvedStorageRoot{Target: storage.FilesystemRootTarget{Path: base}}, base
}

func TestTransferActionsAreCheckedBeforeEffects(t *testing.T) {
	denied := identity.Delete
	p, root, base := guardedFilesystem(t, func(actions ...string) error {
		for _, action := range actions {
			if action == denied {
				return errors.New("forbidden")
			}
		}
		return nil
	})
	if err := os.WriteFile(filepath.Join(base, "source"), []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := p.Move(root, "source", "target", false); err == nil {
		t.Fatal("move without source delete accepted")
	}
	if _, err := os.Stat(filepath.Join(base, "target")); !os.IsNotExist(err) {
		t.Fatal("denied move created its target")
	}
	if _, err := p.Copy(root, "source", "target", false); err != nil {
		t.Fatalf("copy should not require source delete: %v", err)
	}
	denied = identity.Mkdir
	if _, err := p.Copy(root, "source", "missing/child", false); err == nil {
		t.Fatal("copy implicitly created a parent without mkdir")
	}
	if _, err := p.Rename(root, "source", "target"); err == nil {
		t.Fatal("rename overwrote a destination")
	}
}

func TestRecursiveWorkStopsAfterAuthorizationChanges(t *testing.T) {
	allowed := true
	p, root, base := guardedFilesystem(t, func(...string) error {
		if !allowed {
			return errors.New("forbidden")
		}
		return nil
	})
	if err := os.Mkdir(filepath.Join(base, "tree"), 0700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"one", "two", "three"} {
		if err := os.WriteFile(filepath.Join(base, "tree", name), []byte("keep"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	summary, err := p.DeleteRecursive(context.Background(), root, "tree", func(event storage.DeleteItemEvent) {
		if event.Status == "completed" {
			allowed = false
		}
	})
	if !errors.Is(err, context.Canceled) || summary.Deleted != 1 {
		t.Fatalf("work continued after authorization loss: %#v, %v", summary, err)
	}
	entries, err := os.ReadDir(filepath.Join(base, "tree"))
	if err != nil || len(entries) != 2 {
		t.Fatalf("partial effects not preserved: %d, %v", len(entries), err)
	}
}

type blockingRangeProvider struct {
	storage.StorageProvider
	reader io.ReadCloser
}

func (p blockingRangeProvider) RangeRead(storage.ResolvedStorageRoot, string, int64, int64) (io.ReadCloser, storage.FileContentInfo, error) {
	return p.reader, storage.FileContentInfo{}, nil
}

func TestRangeDeadlineInterruptsAnAlreadyBlockedRead(t *testing.T) {
	reader, writer := io.Pipe()
	defer writer.Close()
	p := &GuardedProvider{StorageProvider: blockingRangeProvider{reader: reader}, Check: func(...string) error { return nil }, Deadline: func(parent context.Context) (context.Context, context.CancelFunc) {
		return context.WithTimeout(parent, 50*time.Millisecond)
	}}
	guarded, _, err := p.RangeRead(storage.ResolvedStorageRoot{}, "file", 0, -1)
	if err != nil {
		t.Fatal(err)
	}
	defer guarded.Close()
	finished := make(chan error, 1)
	go func() { _, err := guarded.Read(make([]byte, 1)); finished <- err }()
	select {
	case err := <-finished:
		if err == nil {
			t.Fatal("expired read succeeded")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("authentication deadline did not interrupt the read")
	}
}

func TestCopyRejectsOverlappingPathsBeforeEffects(t *testing.T) {
	p, root, base := guardedFilesystem(t, func(...string) error { return nil })
	if err := os.MkdirAll(filepath.Join(base, "tree", "child"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(base, "tree", "child", "keep"), []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, pair := range [][2]string{{"tree/", "tree/child/new"}, {"tree/child", "tree"}, {"/tree", "tree"}, {"", "copy"}} {
		if _, err := p.Copy(root, pair[0], pair[1], true); err == nil {
			t.Fatalf("overlapping copy accepted: %v", pair)
		}
	}
	if data, err := os.ReadFile(filepath.Join(base, "tree", "child", "keep")); err != nil || string(data) != "keep" {
		t.Fatal("overlapping copy changed its source")
	}
}
