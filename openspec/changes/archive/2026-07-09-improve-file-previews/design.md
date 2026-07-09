## Context

Today, file previews are split across two paths that don't compose:

- `frontend/src/plugins/fileOpeners.ts` hardcodes a `builtInOpeners` array (text, markdown, json, csv, image, pdf, audio, video, archive-metadata) with real per-type views.
- Backend-configured `uiPlugins` (`config/cagnard.example.conf`) are merged into the same candidate list, but `pluginOpeners()` hardcodes every plugin's `view` to `"text"` — a plugin can never render anything but a raw text dump, regardless of what it's for.

On the backend, `GET /api/storage/preview` bounds text reads at 256KB and **errors** (not truncates) past that limit, despite `PreviewResponse.truncated` existing in the API contract and never being set `true`. `GET /api/storage/content` (used for media/download) fully buffers the entire file server-side (`os.ReadFile` / a single S3 `GetObject`) and ships it as one response with `Content-Disposition: attachment`; the frontend fetches this into a blob before handing it to `<video>`/`<audio>`. This caps usable media at 48MB and prevents seeking before the whole file has downloaded.

Two things already exist that this design leans on heavily:
- `StreamRead`/`StreamGet` (`backend-go/internal/storage/{filesystem,s3}.go`) already stream file content to an `io.Writer` without full buffering — but only the transfer/copy engine (`backend-go/internal/api/transfer.go`) calls them. No HTTP handler uses them.
- `capabilities.go` already lists `range-read` as a capability, with status `"planned"` for both providers — anticipated but never implemented.
- Auth is same-origin session cookie (`credentials: "same-origin"` in `frontend/src/api/client.ts`), not a bearer header, so browser elements (`<video>`, `EventSource`) can hit backend URLs directly and carry auth automatically — no blob pre-fetch is structurally required for any of this.

## Goals / Non-Goals

**Goals:**
- One opener registry; first-party openers (text, log, media, csv, json, pdf, archive) are registered the same way any opener would be, with no code path that treats "built-in" as structurally different from "plugin."
- Real pagination and content search for text-like files instead of a hard size ceiling.
- Syntax highlighting and additional structured views (YAML tree, diff coloring) on top of the existing per-extension language classification.
- A log opener with level coloring and live "follow" built on a generic, reusable file-change notification primitive (not log-specific).
- Byte-range HTTP delivery so media can seek without full download and without the server buffering whole files in memory; raise/remove the current 48MB ceiling now that it's no longer a memory-safety mechanism.
- Real archive listing and nested preview for stdlib-supported formats (`zip`, `tar`, `tar.gz`/`tgz`, `gz`), reusing the range-read engine for zip's central-directory-at-the-end structure.

**Non-Goals:**
- No out-of-process "renderer-server" execution model in this change. Two renderer shapes (text, range/media) don't justify the operational cost of a sidecar process, IPC protocol, and a new trust boundary for file-byte access. The renderer interface is designed so a future implementation can become an RPC client without changing the registry, HTTP layer, or frontend — but nothing is built or stubbed for that now.
- No `.parquet`, `.sqlite`, checksum/integrity, media-metadata (EXIF), or notebook (`.ipynb`) plugins.
- No `.rar`/`.7z` archive support (both require a non-stdlib dependency or shelling out; deferred).
- No general third-party/untrusted plugin code loading. Plugins remain configuration that selects and parameterizes an existing engine (text, range, bounded) — never arbitrary executed code, frontend or backend.
- No changes to the existing transfer-job status polling mechanism; the new file-watch primitive is separate and does not replace it.

## Decisions

### One registry, no built-in/plugin distinction
Collapse `builtInOpeners` and `pluginOpeners()` into a single list assembled from manifests. First-party openers ship as manifests baked into the backend (or default config), not as special-cased TypeScript objects. `UiPluginManifest` gains a `view` (or `engine`) field so a manifest can target any registered view — the current hardcoded `view: "text"` in `pluginOpeners()` is the single biggest blocker to plugins doing anything beyond raw text, and is removed. Alternative considered: keep built-ins hardcoded and only extend plugin capability — rejected because it keeps the exact duplication (e.g. the sample `text-preview` plugin re-covering `markdown`/`text` territory already owned by a built-in) that motivated this change.

### Three shared engines, not one-off renderers
Rather than every plugin implementing its own read strategy, plugins declare which shared engine backs them:
- **Text engine**: paginated reads (`offset`/`limit` in file terms, not bytes-or-nothing), content search (regex/case options), and rendering hooks (highlighting, structured view). Log and (optionally later) diff/YAML-tree views sit on top of this engine rather than being separate read paths.
- **Range engine**: byte-range reads (`RangeRead(offset, length)`), used by media (seeking) and by archive listing/entry reads (zip central directory + entries).
- **Bounded engine**: today's simple bounded-or-error behavior, kept as-is for openers that don't need more (e.g. PDF, small CSV) — not every opener needs to be rebuilt.

This is a straightforward extraction of a `PreviewRenderer`-shaped Go interface (`Paginate`, `Search`, `RangeRead`, `Capabilities`) implemented directly as structs today. If a future plugin (parquet) needs to run out-of-process, the same interface becomes an RPC client — the registry and HTTP layer don't change shape.

### Range reads: wire existing streaming, add offset/length
`StreamRead`/`StreamGet` copy a whole object to a `Writer` with no offset parameter — they're insufficient for HTTP `Range` as-is. Add a `RangeRead(root, path, offset, length) (io.ReadCloser, FileContentInfo, error)` to the provider interface: filesystem implements it with `os.File.Seek` + limited `io.Copy`; S3 implements it with `GetObjectInput.Range`. `GET /api/storage/content` parses an incoming `Range` header, calls `RangeRead`, and replies `206 Partial Content` with `Content-Range`/`Accept-Ranges`; absent a `Range` header it falls back to the existing full-body behavior for compatibility. `capabilities.go` flips `range-read` from `"planned"` to `"supported"` for both providers once wired.

Frontend media elements point `src` directly at `/api/storage/content?...` instead of pre-fetching a blob — same-origin cookie auth means the browser sends the `Range` requests itself; Cagnard doesn't need to implement any client-side range logic.

### Live file updates: SSE, generic event shape, separate from job polling
Chosen over WebSocket: the traffic is one-directional (server → client), `net/http` + `Flusher` covers SSE with zero new dependencies (today's `go.mod` has none beyond the AWS SDK), and `EventSource` sends cookies automatically for same-origin requests — matching existing auth with no new plumbing. WebSocket would only be justified by a bidirectional need this project doesn't have.

New endpoint `GET /api/storage/watch?root=&path=`, emitting `appended {offset, length}`, `replaced` (e.g., log rotation — size shrank or identity changed), and `removed`, plus a periodic comment-line keepalive so intermediary proxies don't close idle connections. This is a generic per-(root,path) subscription, not log-specific: the log opener's follow mode is its first consumer (`appended` → `RangeRead` from the new offset), but any future feature (e.g., "this file changed elsewhere while you're editing it") can subscribe to the same primitive. It is intentionally a separate mechanism from the existing transfer-job status polling (`useCagnardData.ts`) — different subject (file bytes vs. job lifecycle), no shared transport or schema.

Provider asymmetry: filesystem backs `watch` with real push (a filesystem-event library) since local files support it natively. S3 has no generic push mechanism Cagnard can assume for an arbitrary bucket, so the S3 provider backs the same client-visible SSE stream with backend-side polling (`HeadObject` at an interval). Modeled as a capability — `watch: supported` for filesystem, `watch: degraded` for S3 — consistent with how `rename` is already modeled as degraded-via-copy+delete for S3 in `capabilities.go`.

### Archive browsing rides the range engine; tar does not get the same benefit
`archive/zip.NewReader` takes an `io.ReaderAt` + size, which maps directly onto `RangeRead`: listing a zip only requires reading its central directory (near the end of the file), and opening an entry only range-reads that entry's bytes — never the whole archive. Tar has no central directory and (when gzip-compressed) isn't seekable, so tar/tar.gz listing requires a sequential scan proportional to archive size; this is accepted as a known cost rather than solved in this change. Depth is "list + nested preview": an entry's path is represented as `archive.zip!/inner/file.json` and routed back through the same opener registry recursively — a JSON entry gets the JSON view, an image entry gets the image viewer — rather than a special-cased archive-only preview.

## Risks / Trade-offs

- **[Risk]** `Content-Disposition: attachment` on `/api/storage/content` currently forces download in some contexts; switching media to `src`-linked native streaming needs this header to be conditional (inline for range-served media, attachment for explicit downloads) → **Mitigation**: branch on request intent (explicit download action vs. opener-initiated range request), not on a single global header value.
- **[Risk]** S3-backed `watch` is polling under the hood; a short poll interval multiplied across many open log-follow tabs could increase `HeadObject` call volume → **Mitigation**: back off polling interval per-subscription, and document `watch` as `degraded` for S3 so this cost is visible rather than assumed to be real push.
- **[Risk]** Removing/raising the 48MB media ceiling removes a blunt but real memory-safety backstop → **Mitigation**: the range engine never buffers a full file regardless of its size, so the ceiling's original purpose (bounding server memory) is satisfied structurally; any remaining ceiling becomes a UX/bandwidth choice, not a safety one.
- **[Trade-off]** Keeping renderer logic in-process (non-goal: no renderer-server) means a future genuinely heavy format (parquet) will require either a real Go decoder dependency or revisiting this decision later — accepted deliberately rather than building unused infrastructure now.
- **[Risk]** `UiPluginManifest` gaining a required `view` field is a breaking config change for any existing deployment's `uiPlugins` entries (e.g., the example `text-preview` plugin) → **Mitigation**: documented in the proposal as **BREAKING**; example config is updated in this change.

## Migration Plan

1. Add `RangeRead` to the provider interface and implement it for filesystem and S3; flip the `range-read` capability status. No behavior change yet for existing endpoints.
2. Add `Range` header handling to `downloadContent`; verify existing (non-range) requests are unaffected by the fallback path.
3. Point media `<video>`/`<audio>` at the endpoint directly; remove blob pre-fetch for media only (other openers unaffected).
4. Introduce the unified registry and `view`-aware plugin manifests; migrate the existing built-in openers into manifests one at a time behind the same registry so the frontend opener-resolution behavior stays stable throughout.
5. Add text pagination + content search + highlighting; these are additive to the text view and don't change existing markdown/JSON/CSV behavior.
6. Add the `watch` endpoint and log follow mode as new, additive surfaces.
7. Add archive listing/nested preview last, since it depends on the range engine and the unified registry both being in place.

No data migration is needed (no persisted schema changes); rollback at any step is deleting the newly added endpoint/manifest without needing to undo earlier steps, since each step is additive until the registry unification (step 4), which is the one step that should be validated carefully against existing `uiPlugins` config before shipping.

## Open Questions

- Exact polling interval for S3 `watch` degraded mode — needs a default that balances follow-latency against `HeadObject` cost; no strong constraint found in the existing codebase to anchor this.
- Whether content search should be capped/paginated server-side for very large files (return first N matches + a continuation cursor) or run to completion per request — leaning toward capped/paginated for consistency with the rest of the pagination model, to be confirmed during implementation.
