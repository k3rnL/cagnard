# File Compatibility

## Behavior

Cagnard classifies files separately from opening them. The core browser owns file type classification, opener routing, capability checks, authorization, and fallback behavior. Format-specific parsing, rendering, editing, validation, and export behavior belong to file opener plugins.

Implemented classification uses provider MIME metadata first and falls back to a maintained extension catalog for common user and developer formats:

- text, Markdown, JSON, CSV/TSV, XML, YAML, source code, config, and logs
- browser-supported images, PDF, audio, and video
- archives and common office/data/database formats as metadata-first types

MIME values are normalized for classification and opener routing. Parameters and casing differences such as `Application/JSON; charset=utf-8` are treated as `application/json`, while user-visible metadata can still show the provider value where the browser needs it.

The browser now opens content only through an explicit user action. Selecting a file updates metadata and actions but does not fetch file content. A normal Open replaces the file list with the opener surface. A row hover quick-view action inserts the opener inline in the list for temporary inspection.

## Built-In Openers

First-party openers are registered as manifests through the same registry model as configured UI plugins:

- text/source/config editor with bounded reads, syntax highlighting, in-file search, pagination, and write-back when authorized
- log explorer with level-based coloring, in-file search, and live follow (tail) for providers that support change notification
- Markdown rendered/source views with editing when authorized
- JSON and YAML tree/source views (JSON adds prettify and minify actions)
- diff/patch view with colorized added/removed lines
- CSV/TSV table view with raw fallback and row sampling
- browser-native image, PDF, audio, and video viewers; media streams directly from the byte-range content endpoint so playback can seek without a full download
- archive browsing (zip, tar, tar.gz/tgz, gz) with nested entry preview through the same opener registry; `.rar`/`.7z` fall back to metadata only

Unsupported or oversized files show type metadata and keep safe storage actions available.

## Example Fixtures

The default example storage includes a fixture directory at `examples/storage/home/alice/compatibility-lab`. It is exposed in the running app under Alice's Home storage root and contains Markdown, JSON, CSV, TSV, YAML, XML, source, log, SVG, and unsupported payload samples.

## Plugin Contract

File openers declare constraints before Cagnard routes files to them:

- MIME patterns, extensions, categories, priority, and mode
- target `view` (rendering surface); an unrecognized view falls back to the text view
- read strategy: metadata, bounded, or download in the current implementation
- edit and save strategy
- maximum file size
- required storage capabilities such as `bounded-read`, `download`, or `overwrite`

Plugins receive only scoped access mediated by Cagnard. They do not receive raw provider credentials.

## Large File Notes

Text and structured openers use bounded reads and paginate: a file past the bounded read limit returns its first page with `truncated` set, and the opener loads further pages on demand rather than refusing to open. Editing and save are disabled while a file is only partially loaded.

The storage capability model distinguishes `full-read`, `bounded-read`, `range-read`, and `stream-read`. Range reads are implemented for both the filesystem and S3 providers: the content endpoint honors `Range` requests with `206 Partial Content`, which backs seekable media playback and archive entry reads without buffering whole files server-side.

## Known Limitations

- The MIME catalog is maintained in code for the prototype; automated IANA registry generation is still future work.
- Office, notebook, database, Parquet/Avro/ORC, CAD/GIS, and other complex formats are not deeply parsed by core.
- CSV parsing is a pragmatic browser table view, not a full data-processing engine.
- JSON formatting is limited to files inside the configured bounded opener size.
