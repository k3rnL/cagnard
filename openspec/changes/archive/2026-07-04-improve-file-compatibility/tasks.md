## 1. File Type Catalog

- [x] 1.1 Add a catalog data model for MIME type, extension, category, icon identifier, and confidence/source metadata.
- [ ] 1.2 Add or generate an initial catalog from IANA media types plus maintained practical extension fallbacks.
- [x] 1.3 Add icon/category mappings for common user and developer file families.
- [x] 1.4 Add tests for known MIME, extension fallback, unknown types, and category/icon classification.

## 2. Opener Plugin Contract

- [x] 2.1 Define frontend opener registration types for MIME patterns, extensions, categories, priority, mode, edit strategy, read strategy, save strategy, size limits, and required capabilities.
- [x] 2.2 Implement deterministic opener resolution and fallback behavior.
- [x] 2.3 Ensure opener plugins receive scoped content APIs and never raw provider credentials.
- [ ] 2.4 Add tests for opener matching, multiple matches, unsupported files, oversized files, and missing storage capabilities.

## 3. Browser UI Flow

- [x] 3.1 Remove automatic content preview from row selection and keep selection focused on metadata/actions.
- [x] 3.2 Add an explicit open action for files.
- [x] 3.3 Add file type/category/icon display to listings and metadata surfaces.
- [x] 3.4 Add an unsupported-file open state that preserves download and other safe actions.
- [x] 3.5 Verify current-directory filtering, column sorting, multi-selection, and metadata panels still work with the new open flow.

## 4. Built-in Openers

- [ ] 4.1 Implement raw/source text opener with safe decoding, search, line numbers, wrap control, and size limits.
- [x] 4.2 Implement Markdown source/rendered opener and editor where write-back is authorized.
- [ ] 4.3 Implement JSON source/tree opener with validate, prettify, minify, and copy-path helpers within configured limits.
- [x] 4.4 Implement CSV/TSV table opener with raw fallback, delimiter handling, and sampling/chunking for larger files.
- [x] 4.5 Implement XML/YAML/source/config/log handling where practical under text limits.
- [x] 4.6 Implement browser-native image, PDF, audio, and video openers where supported by the browser and storage capabilities.

## 5. Storage Capability Support

- [x] 5.1 Extend provider capability models with full read, bounded read, range read, stream read, and write-back semantics.
- [x] 5.2 Map filesystem and S3 provider capabilities to the new content access model conservatively.
- [x] 5.3 Enforce configured limits before full-buffer opener reads or write-back operations.
- [x] 5.4 Document future provider expectations for range and stream reads.

## 6. Documentation And Verification

- [x] 6.1 Update feature documentation for file type classification, explicit opening, opener plugins, large-file fallback, and built-in openers.
- [x] 6.2 Update plugin documentation with opener manifest fields and security constraints.
- [x] 6.3 Add frontend typecheck/build coverage for opener registry and built-in opener components.
- [x] 6.4 Add backend tests for any new capability metadata and content-access limit behavior.
- [ ] 6.5 Run OpenSpec validation for `improve-file-compatibility`.
