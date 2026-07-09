## Why

File previews are split across two inconsistent paths today: a hardcoded `builtInOpeners` array and a config-driven `uiPlugins` mechanism whose plugins can only ever render a `"text"` view. Text preview hard-fails past 256KB instead of paginating, there is no syntax highlighting, and media playback fully buffers files server-side (capped at 48MB) with no seeking, even though the `StreamRead`/`StreamGet` streaming primitives already exist internally for the transfer engine and `range-read` is already listed as a "planned" capability. This change makes previews genuinely useful for real files (long logs, videos, archives) and collapses the built-in/plugin split so new format support is added the same way every time.

## What Changes

- Replace the built-in-openers-vs-plugins split with a single opener registry: first-party openers (text, log, media, csv, json, pdf, archive) are declared the same way a third-party plugin manifest would be, with no structurally special "built-in" path. **BREAKING**: `UiPluginManifest`/plugin config gains a `view`/engine field instead of every plugin being forced onto `"text"`; existing plugin config entries must declare a target view.
- Text engine: replace the current bounded-preview-or-error behavior with real pagination (fetch further pages of a large file instead of failing), server-side content search with regex and case-sensitivity options, and syntax highlighting driven by the language labels already computed in the file type catalog. Add structured views for YAML (tree, like JSON) and diff/patch (colorized +/-).
- Log opener: a specialization of the text engine adding log-level coloring and a "follow" (tail) mode that consumes live append notifications.
- Range-read engine: wire the existing streaming primitives into the HTTP content endpoint with real `Range`/`206 Partial Content` support, so media playback can seek without a full download and without the server buffering the whole file in memory. Raise or remove the current media size ceiling now that the server no longer needs to hold the whole file at once.
- Live file updates: a new generic, one-directional (SSE) per-file change notification primitive (`appended`, `replaced`, `removed`) that the log follow feature consumes, decoupled from and not reusing the existing transfer-job status polling.
- Archive browsing: replace the metadata-only archive view with real listing and nested preview for `.zip`, `.tar`, `.tar.gz`/`.tgz`, and `.gz` (`.rar`/`.7z` explicitly out of scope, deferred). Opening an entry inside an archive routes back through the same opener registry recursively.

## Capabilities

### New Capabilities
- `content-search`: server-side search within a single file's content (regex, case-sensitivity), distinct from existing directory/filename search.
- `live-file-updates`: generic per-file change notification stream (append/replace/remove) usable by any opener or future feature, not just logs.
- `archive-browsing`: listing and nested, recursive preview of entries inside supported archive formats.

### Modified Capabilities
- `file-openers-and-editors`: text-like openers gain pagination past size limits (instead of refusing), syntax highlighting, additional structured views (YAML, diff), a log opener with level coloring and follow, and native seekable media playback via range reads.
- `ui-plugin-system`: opener plugins (including first-party ones) declare a target view/engine instead of being restricted to a fixed text rendering; removes the implicit built-in/plugin distinction from the registration model.
- `storage-plugin-system`: `range-read` moves from a declared-but-unimplemented ("planned") capability to a delivered one for filesystem and S3 providers; adds a `watch` capability (supported for filesystem via native file events, degraded for S3 via backend-side polling).

## Impact

- Frontend: `frontend/src/plugins/fileOpeners.ts` (registry unification, remove hardcoded `view: "text"`), `frontend/src/plugins/fileTypeCatalog.ts` (feed language identity to highlighting), `frontend/src/api/types.ts` (`UiPluginManifest`, `PreviewResponse` — actually honor `truncated`), `frontend/src/components/StorageBrowser.tsx` (new log/archive views, native `<video>`/`<audio>` pointed at the streaming endpoint instead of a pre-fetched blob).
- Backend: `backend-go/internal/api/server.go` (`previewContent`, `downloadContent` gain pagination/Range handling; new watch and content-search endpoints), `backend-go/internal/storage/{filesystem,s3}.go` (range-capable reads, archive entry reads), `backend-go/internal/storage/capabilities.go` (`range-read` → supported, new `watch` capability), `backend-go/internal/storage/models.go` (provider interface additions).
- Config: `config/cagnard.example.conf` (`uiPlugins` entries need a `view` field; the current overlapping `text-preview` example becomes redundant with the first-party text opener and should be removed or repurposed as a real example of a distinct plugin).
- New dependency: none required for in-scope archive formats (stdlib `archive/zip`, `archive/tar`, `compress/gzip`); `fsnotify` (or equivalent) is a new, small dependency for filesystem watch support.
- Deferred, not built in this change: `.parquet`/`.sqlite` plugins, checksum/integrity and media-metadata openers, notebook rendering, `.rar`/`.7z` archive support, any out-of-process "renderer-server" execution model.
