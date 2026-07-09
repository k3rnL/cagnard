## 1. Range-read engine (backend)

- [x] 1.1 Add `RangeRead(root, path, offset, length) (io.ReadCloser, FileContentInfo, error)` to the storage provider interface in `backend-go/internal/storage/models.go`
- [x] 1.2 Implement `RangeRead` for `FilesystemProvider` using `os.File.Seek` + bounded `io.Copy` (`backend-go/internal/storage/filesystem.go`)
- [x] 1.3 Implement `RangeRead` for `S3StorageProvider` using `GetObjectInput.Range` (`backend-go/internal/storage/s3.go`)
- [x] 1.4 Flip `range-read` from `"planned"` to `"supported"` for both providers in `backend-go/internal/storage/capabilities.go`
- [x] 1.5 Parse the `Range` request header in `downloadContent` (`backend-go/internal/api/server.go`), call `RangeRead`, and reply `206 Partial Content` with `Content-Range`/`Accept-Ranges`; fall back to the existing full-body path when no `Range` header is present
- [x] 1.6 Make `Content-Disposition` conditional (inline for opener/range-served requests, `attachment` for explicit download requests) instead of always forcing download
- [x] 1.7 Add backend tests covering: mid-file range, open-ended range (`bytes=N-`), out-of-range request, and the no-`Range`-header fallback, for both providers

## 2. Media streaming (frontend)

- [x] 2.1 Point `<video>`/`<audio>` `src` directly at `/api/storage/content?...` instead of pre-fetching into a blob URL (`frontend/src/components/StorageBrowser.tsx`)
- [x] 2.2 Remove the now-unused blob pre-fetch path for the media opener specifically, leaving other openers unaffected
- [x] 2.3 Raise or remove the 48MB `mediaLimit` in `frontend/src/plugins/fileOpeners.ts` now that the server no longer buffers whole files for range-served content
- [ ] 2.4 Manually verify seeking (including seeking to an unbuffered position) on a video larger than the old 48MB ceiling, for both filesystem and S3 roots

## 3. Unified plugin registry

- [x] 3.1 Add a `view`/engine field to `UiPluginManifest` (`frontend/src/api/types.ts` and the corresponding Go struct in `backend-go/internal/api/models.go`)
- [x] 3.2 Remove the hardcoded `view: "text"` in `pluginOpeners()` (`frontend/src/plugins/fileOpeners.ts`); read the declared view/engine instead
- [x] 3.3 Convert each entry of `builtInOpeners` into a manifest served the same way plugin manifests are, removing the separate hardcoded array and the built-in/plugin merge special-casing
- [x] 3.4 Verify `resolveFileOpener`/`openerBlockedReason` behavior is unchanged for existing file types after the registry unification (regression pass against current opener resolution tests)
- [x] 3.5 Update `config/cagnard.example.conf`: remove or repurpose the overlapping `text-preview` example plugin now that it duplicates the first-party text opener, and document the new required `view` field

## 4. Text engine: pagination, content search, highlighting

- [x] 4.1 Replace the reject-past-256KB behavior in `Preview` (`backend-go/internal/storage/{filesystem,s3}.go`) with paginated reads; honor and actually set `PreviewResponse.truncated`
- [x] 4.2 Add a pagination parameter (offset/cursor) to the preview endpoint (`previewContent` in `backend-go/internal/api/server.go`) and to the frontend text opener's fetch logic
- [x] 4.3 Add "load more" UI to the text/source view for paginated files (`frontend/src/components/StorageBrowser.tsx`)
- [x] 4.4 Implement server-side content search (regex + case-sensitivity options, bounded match count with continuation) as a new endpoint or extension of the preview endpoint
- [x] 4.5 Add in-file search UI (regex/case-sensitive toggles) to the text and log views, reusing the same search UI for both
- [x] 4.6 Add a syntax highlighting dependency (small, all-languages-upfront) and wire it to the raw/source view using the language labels already computed in `frontend/src/plugins/fileTypeCatalog.ts`
- [x] 4.7 Add a YAML structured tree view alongside the existing JSON tree view (`JsonView`-equivalent component in `frontend/src/components/StorageBrowser.tsx`)
- [x] 4.8 Add a diff/patch view with colorized added/removed lines

## 5. Log opener and live file updates

- [x] 5.1 Add a `watch` capability to `backend-go/internal/storage/capabilities.go` (`supported` for filesystem, `degraded` for S3)
- [x] 5.2 Implement filesystem change detection (native file-event watching) and emit `appended`/`replaced`/`removed` events
- [x] 5.3 Implement S3 change detection via backend-side polling (`HeadObject` at an interval), emitting the same event shape as filesystem
- [x] 5.4 Add `GET /api/storage/watch?root=&path=` SSE endpoint in `backend-go/internal/api/server.go` with periodic keepalive comments
- [x] 5.5 Add a generic frontend subscription hook (e.g. `useFileWatch`) wrapping `EventSource`, independent of the existing transfer-job polling code path
- [x] 5.6 Build the log opener view: level-based coloring on top of the shared text view
- [x] 5.7 Wire log follow mode: on `appended` event, call range-read for the new byte span and append parsed lines to the view
- [x] 5.8 Handle `replaced` events in follow mode by resetting the view instead of treating it as a continuation (log rotation case)
- [ ] 5.9 Manually verify follow mode against a rotating log file and a non-rotating growing log file

## 6. Archive browsing

- [x] 6.1 Implement zip listing using `archive/zip.NewReader` over an `io.ReaderAt` backed by `RangeRead` (no full-archive download)
- [x] 6.2 Implement tar/tar.gz/tgz listing via sequential scan (`archive/tar`, `compress/gzip`)
- [x] 6.3 Implement `.gz`-as-single-entry handling for non-tar gzip files
- [x] 6.4 Add an endpoint (or extend an existing one) to list archive entries and to read a single entry's content by path within the archive
- [x] 6.5 Add an `archive.zip!/inner/path` style addressing scheme for archive entries on the frontend and route entry opens back through the unified opener registry (task group 3)
- [x] 6.6 Build the archive browsing UI: entry list view replacing the current metadata-only `ArchiveMetadata` component, with nested nagivation into entries
- [x] 6.7 Fall back to metadata-only display for `.rar`/`.7z` (no listing attempt)
- [x] 6.8 Add tests for zip/tar entry listing and entry content reads, including a nested archive-within-archive case

## 7. Cleanup and documentation

- [ ] 7.1 Update `openspec/specs/` via archive/sync once this change ships, per standard OpenSpec workflow
- [x] 7.2 Update README/config documentation for the new `uiPlugins` `view` field and the removed/repurposed example plugin
- [x] 7.3 Confirm no regressions in existing file-opener test coverage (`backend-go/internal/api/server_test.go`, `backend-go/internal/storage/filesystem_test.go`) after the registry unification and range-read changes
