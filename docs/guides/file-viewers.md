# File Viewers

Selecting a row updates metadata without downloading content. Opening a file explicitly routes it through the first compatible opener manifest.

## Included Openers

| Content | Experience |
| --- | --- |
| Text, source, and config | Paginated source view, line-oriented search, wrapping, editing when writable |
| Markdown | Rendered and source views |
| JSON and YAML | Structured and raw views with validation/formatting |
| CSV and TSV | Bounded table with raw fallback |
| Diff and patch | Added, removed, and hunk highlighting |
| Logs | Level coloring, content search, and follow mode when watch is available |
| Images, audio, video, PDF | Browser-native in-app viewers; media uses range requests for seeking |
| ZIP, TAR, TAR.GZ, TGZ, GZ | Archive listing and nested entry opening |

RAR and 7z currently show metadata only.

## Large Files

Text-like files load in bounded pages. **Load more** retrieves additional content instead of requiring a complete browser buffer. In-file search supports case sensitivity and regular expressions with bounded, continuable results.

Media elements request byte ranges directly from the backend. Filesystem and S3 providers implement range reads, so playback can seek without downloading the whole file first.

## Log Follow

Follow mode subscribes to a per-file Server-Sent Events stream. Filesystem providers use native file notifications; S3 uses degraded backend polling. Appended ranges are fetched and added to the view. Replacement, truncation, rotation, or removal resets or stops the view rather than presenting discontinuous content as one stream.

## Editing

An opener declares whether it is a viewer, editor, or export-only tool and which save strategy it requires. Direct save is offered only when the root is writable and the provider exposes the needed overwrite/version capability. Opener plugins receive scoped file APIs, never raw storage credentials.

## Plugin Selection

First-party and configured openers share one manifest shape. Matching considers MIME type, extension, normalized category, priority, content strategy, provider capabilities, and size constraints. If an opener declines or fails, Cagnard can fall back to another compatible opener without failing the browser.

See [UI plugin architecture](../architecture/ui-plugins.md).
