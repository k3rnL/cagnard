# File Compatibility

## Behavior

Cagnard classifies files separately from opening them. The core browser owns file type classification, opener routing, capability checks, authorization, and fallback behavior. Format-specific parsing, rendering, editing, validation, and export behavior belong to file opener plugins.

Implemented classification uses provider MIME metadata first and falls back to a maintained extension catalog for common user and developer formats:

- text, Markdown, JSON, CSV/TSV, XML, YAML, source code, config, and logs
- browser-supported images, PDF, audio, and video
- archives and common office/data/database formats as metadata-first types

The browser now opens content only through an explicit user action. Selecting a file updates metadata and actions but does not fetch file content. A normal Open replaces the file list with the opener surface. A row hover quick-view action inserts the opener inline in the list for temporary inspection.

## Built-In Openers

The first built-in opener set is bundled through the same registry model used for future UI plugins:

- text/source/config/log editor with bounded reads and write-back when authorized
- Markdown rendered/source views with editing when authorized
- JSON tree/source views with prettify and minify actions
- CSV/TSV table view with raw fallback and row sampling
- browser-native image, PDF, audio, and video viewers for files within opener limits
- archive metadata view without extraction

Unsupported or oversized files show type metadata and keep safe storage actions available.

## Example Fixtures

The default example storage includes a fixture directory at `examples/storage/home/alice/compatibility-lab`. It is exposed in the running app under Alice's Home storage root and contains Markdown, JSON, CSV, TSV, YAML, XML, source, log, SVG, and unsupported payload samples.

## Plugin Contract

File openers declare constraints before Cagnard routes files to them:

- MIME patterns, extensions, categories, priority, and mode
- read strategy: metadata, bounded, or download in the current implementation
- edit and save strategy
- maximum file size
- required storage capabilities such as `bounded-read`, `download`, or `overwrite`

Plugins receive only scoped access mediated by Cagnard. They do not receive raw provider credentials.

## Large File Notes

Current built-in text and structured openers use bounded reads. Large JSON, CSV, logs, datasets, and media files may be refused by the opener before content is loaded.

The storage capability model now distinguishes `full-read`, `bounded-read`, `range-read`, and `stream-read`. Range and stream opening are planned capability surfaces and are not implemented yet.

## Known Limitations

- The MIME catalog is maintained in code for the prototype; automated IANA registry generation is still future work.
- Office, notebook, database, Parquet/Avro/ORC, CAD/GIS, and other complex formats are not deeply parsed by core.
- CSV parsing is a pragmatic browser table view, not a full data-processing engine.
- JSON formatting is limited to files inside the configured bounded opener size.
