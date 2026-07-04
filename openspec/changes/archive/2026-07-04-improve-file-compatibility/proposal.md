## Why

Cagnard currently treats preview as a side panel attached to file selection, which does not scale to large files, specialized formats, or editor-capable plugins. The browser needs a stronger file compatibility model: known MIME/media types, visual file classification, and explicit in-app file opening through preview/editor plugins.

## What Changes

- Add a file type catalog based on the official IANA Media Types registry, with MDN/common-type data used only as a practical extension and fallback source for common extensions.
- Add icon classification for top-level media categories and important specific formats so the browser can show recognizable file icons without requiring provider-specific UI.
- Replace selection-triggered preview in the browsing/details panel with an explicit open-file flow. Browsing a directory should inspect metadata; opening a file should launch the in-app viewer/editor surface.
- Extend preview plugins into file opener plugins that can declare whether they are read-only viewers or editor-capable components.
- Add large-file compatibility requirements so Cagnard avoids loading large objects entirely into memory for open/preview/edit workflows.
- Improve the built-in text opener/editor as the first implementation target, covering plain text, Markdown, JSON, YAML, XML, CSV/TSV, logs, source code, configuration files, and structured text formats where safe.
- Add common opener/editor tools useful to plain users and developers:
  - raw text view for any safely readable text-like file
  - Markdown rendered view plus source editor
  - JSON tree/source views with prettify, minify, validate, and copy-path helpers
  - CSV/TSV table view with raw/source fallback and basic delimiter handling
  - XML/YAML source view with formatting and validation where practical
  - code/config/log viewer with syntax highlighting, line numbers, search, wrap toggle, and raw mode
  - image viewer for common browser-supported images
  - PDF viewer using browser-native rendering when available
  - audio/video viewers using browser-native media support for common formats
  - archive/package metadata viewer for common archives when content listing can be supported safely
- Keep unsupported formats graceful: show known type/category/icon metadata and available actions even when no opener plugin exists.
- Keep complex format behavior outside the core browser. Cagnard core should own classification, routing, safe content access, permissions, and fallback behavior; opener/editor plugins should own format-specific parsing, rendering, editing, validation, and export behavior.

## Capabilities

### New Capabilities

- `file-type-catalog`: Defines MIME/media type registry ingestion, extension fallback, category mapping, icon mapping, and file type classification.
- `file-openers-and-editors`: Defines the in-app file opening model, viewer/editor plugin capabilities, large-file-safe content access, and built-in viewers/editors for common user and developer formats.

### Modified Capabilities

- `storage-browser`: Change preview behavior from selection-panel preview to explicit open-file behavior and show file type/icon metadata in the browser listing.
- `ui-plugin-system`: Extend preview plugins into viewer/editor-capable file opener plugins with declared MIME support, edit support, limits, priority, and fallback behavior.
- `storage-plugin-system`: Strengthen content-access requirements for large files so providers can expose safe byte/range/stream reads and avoid mandatory full-buffer preview for large content.

## Impact

- Frontend browser: remove automatic preview from the metadata panel, add open-file action/navigation, add MIME/category icons, and route files to opener/editor components.
- Frontend plugin registry: expand plugin manifests to include opener mode, edit capability, accepted MIME patterns/categories/extensions, size limits, and required storage capabilities.
- Backend API/storage providers: add or plan large-file-safe content access for openers, including bounded reads and future range/stream support.
- Built-in plugins: improve the text opener/editor and add first-class support for raw text, Markdown, JSON, CSV/TSV, XML/YAML, source/config/log files, browser-supported images, PDF, audio, video, and archive metadata where safe.
- Data/catalog assets: introduce a generated or maintained MIME/media type catalog sourced from IANA, plus category/specific-format icon mappings.
- Documentation/specs: clarify the difference between browse metadata, open/view, edit, download, and provider-native preview capabilities.
