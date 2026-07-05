## Context

Cagnard currently has a provider-neutral file browser with metadata, selection, preview, download, upload, and basic lifecycle actions. Preview is still modeled as a browser-side detail attached to selected entries, and content access is primarily small-file oriented.

That model is too weak for large files and complex formats. JSON and CSV can be too large to load or prettify in one pass. Archives, PDFs, media, Office documents, database files, notebooks, columnar data, and domain formats may need specialized parsing, sandboxing, workers, partial reads, or export-only editing. Cagnard needs a file compatibility model that makes these formats possible without turning the core browser into a pile of format-specific branches.

## Goals / Non-Goals

**Goals:**

- Introduce a file type catalog for MIME/media types, extension fallback, category mapping, and icon classification.
- Replace selection-triggered preview with an explicit file opening flow.
- Treat viewers and editors as file opener plugins with declared capabilities, limits, and fallback behavior.
- Keep complex format handling plugin-owned while the core owns routing, authorization, safe content access, and lifecycle policy.
- Add first-party opener plugins for common plain-user and developer formats.
- Define large-file-safe constraints before adding heavy preview/edit features.

**Non-Goals:**

- Implement deep support for every complex file format in the first pass.
- Add full streaming transfer or resumable editing infrastructure immediately.
- Build provider-native document editors, Office collaboration, CAD/GIS tooling, database query consoles, or notebook execution.
- Trust arbitrary frontend plugins with raw credentials or unrestricted storage access.

## Decisions

### 1. Separate file classification from file behavior

Cagnard will introduce a file type catalog that classifies files by normalized MIME type, extension, top-level media category, selected specific format identifiers, and display icon category.

The catalog does not decide how a file is parsed or edited. It provides routing input for the opener registry and a consistent display surface for browser listings, metadata panels, and unsupported-file fallback states.

Rationale: MIME and extension information is useful but imperfect. Keeping classification separate prevents the catalog from becoming a hidden behavior engine and lets opener plugins apply stricter checks, signatures, and provider metadata when needed.

### 2. Use IANA as the primary MIME source with practical fallbacks

The catalog should be generated or maintained from the official IANA Media Types registry as the canonical media-type source. MDN/common web type lists and project-maintained extension mappings can be used as practical fallbacks for common extensions, browser-supported formats, and developer file types.

Provider-supplied MIME values remain metadata hints. When a provider does not supply a type, Cagnard may infer one from extension and catalog rules, with confidence tracked internally or exposed where useful.

Rationale: IANA gives the stable official baseline, while real-world file browsing needs common extension coverage that official registries do not always provide cleanly.

### 3. Make opening explicit

Directory browsing should focus on navigation, selection, metadata, sorting, filtering, and file actions. Opening a file should be an explicit user action that launches a dedicated in-app surface such as a route, modal, drawer, or workspace tab.

The metadata/details area may show type, icon, size, modified time, provider metadata, and available actions, but it should not automatically load file content just because a row is selected.

Rationale: implicit previews are expensive and unsafe for large or complex files. Explicit opening gives Cagnard a clear point to negotiate plugin choice, capabilities, size limits, permissions, and content access strategy.

### 4. Treat first-party viewers as plugins

Built-in text, Markdown, JSON, CSV, image, PDF, audio, and video viewers should be implemented through the same opener registry model expected for external UI plugins.

First-party plugins can be bundled and trusted by default, but they should still declare supported types, edit capability, size limits, read strategy, and save strategy.

Rationale: using the same contract avoids a privileged internal path that external plugins cannot match, and it keeps future replacement or augmentation possible.

### 5. Define the opener contract around constraints

Each opener plugin should declare:

- supported MIME patterns, categories, extensions, and optional content-signature hints.
- priority and whether users may choose among multiple compatible openers.
- mode: viewer only, editor capable, or action-only.
- edit model: none, text, structured, binary, or export-only.
- read strategy: full, bounded, range, stream, or provider-native.
- save strategy: overwrite, create-new-version, save-as/export, patch, or none.
- maximum object size and optional soft warning thresholds.
- required storage capabilities such as download, bounded preview, range read, stream read, upload, overwrite, versioning, or metadata write.
- execution constraints such as worker requirement, sandbox requirement, trusted-only status, and memory limits.

Rationale: complex file support is mostly about knowing when not to open a file, when to open it partially, and how to save without corrupting data. Declared constraints make those decisions explicit.

### 6. Core mediates all content and mutation access

Opener plugins should receive scoped file handles or core-mediated APIs, not raw provider credentials or unrestricted backend access. The core should enforce user authorization, provider capabilities, object size limits, read strategy, mutation rights, and audit policy before content is read or written.

Rationale: UI extensibility should not weaken storage security. This also preserves the stateless backend and external-provider authentication model.

### 7. Large files require bounded and partial behavior

The first implementation may keep existing bounded reads for small content, but the design must allow range and stream reads. Openers that cannot handle large files must decline them before loading content.

Expected first-pass behavior:

- raw/text openers load only within configured text limits.
- JSON prettify/minify/validation runs only within configured limits.
- CSV table view samples or chunks rows when the file is large, with raw/download fallback.
- media/PDF/image viewers use browser-native streaming where possible, subject to provider access support.
- unsupported or oversized files show metadata and safe actions instead of failing after heavy loading.

Rationale: file browsers often encounter large logs, exports, object-store dumps, datasets, and media. The UI must remain predictable even before full streaming is implemented everywhere.

### 8. Start with pragmatic first-party openers

The first built-in opener set should cover common user and developer needs:

- raw text/source view with encoding handling, line numbers, search, wrap toggle, and copy.
- Markdown source and rendered views.
- JSON source/tree views with prettify, minify, validate, and copy-path helpers.
- CSV/TSV table view with delimiter handling, sampling/chunking, and raw fallback.
- XML/YAML source view with formatting/validation where practical.
- code/config/log viewer with syntax highlighting and large-file limits.
- browser-native image, PDF, audio, and video viewers.
- archive metadata/listing only when it can be done safely without extracting arbitrary content.

Rationale: this covers most immediate browser value without making promises about highly specialized document or data formats.

### 9. Keep unsupported formats useful

When no compatible opener exists, Cagnard should still show the known type/category/icon, normalized metadata, provider metadata, size, available actions, and a clear unsupported-state message. Download, copy, move, delete, metadata comparison, and provider-specific actions should remain available according to capabilities.

Rationale: inability to render a file should not make the browser useless for that file.

## Risks / Trade-offs

- MIME values and extensions can lie. -> Treat them as routing hints and allow plugins to perform deeper validation before rendering or editing.
- Plugin power can become a security risk. -> Keep raw credentials unavailable, use scoped core-mediated access, and require explicit plugin capability declarations.
- Large-file support can sprawl. -> Start with bounded/sampled behavior and design for range/stream reads without implementing every strategy at once.
- Built-in editor scope can grow quickly. -> Keep first-party editing focused on text/structured text and browser-native formats; defer complex binary editing to plugins.
- Save/write-back can corrupt complex formats. -> Require opener save strategy declarations and prefer read-only or export-only for formats without robust editing semantics.

## Migration Plan

1. Add the file type catalog and icon/category mapping without changing storage provider behavior.
2. Add opener registry types and first-party opener declarations.
3. Change the browser UI so selection shows metadata/actions and open is explicit.
4. Route file opening through the opener registry and show fallback states for unsupported or oversized files.
5. Improve text/Markdown/JSON/CSV/XML/YAML/source/log viewers and editors under size limits.
6. Add range/stream-oriented storage API contracts or placeholders where providers can support them.
7. Update documentation to distinguish browse metadata, open/view, edit, download, and provider-native preview.

Rollback is UI-contract focused: restore current preview entry points while keeping the catalog as metadata-only if opener routing is not ready.

## Open Questions

- The exact frontend surface for open files can be chosen during implementation: route, drawer, modal, or workspace tab. The spec should require explicit opening, not a specific layout.
