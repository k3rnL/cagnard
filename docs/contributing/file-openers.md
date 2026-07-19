# Adding A First-Party File Opener

File opener behavior is owned by the frontend source tree. Do not add a HOCON selector or backend manifest endpoint.

1. Add or update MIME, extension, category, label, and icon mappings in both `backend-go/internal/storage/filetype.go` and `frontend/src/openers/fileTypeCatalog.ts`.
2. Add a typed descriptor in `frontend/src/openers/fileOpeners.ts`. Use specific MIME/extension rules for formats sharing a broad category.
3. Keep small maintained surfaces inline. Put large parsers, workers, and WASM behind a dynamic import and verify the initial bundle does not include them.
4. Normalize analytical readers through `frontend/src/formats/models.ts`, `readers/types.ts`, and the worker protocol. Use the shared relational adapter when the complete source can be represented safely. Declare only exact operations; do not label visible-page sorting as whole-file sorting.
5. If the source exposes SQL, bind exactly one documented relation named `data`, assign a generation, and use the shared AST validator and bounded execution path. Never concatenate user SQL into source setup statements.
6. Keep multidimensional formats semantic before making them relational. NetCDF adapters preserve groups, dimensions, coordinates, attributes, types, and bounded hyperslabs; only an explicit compatible slice becomes `data`.
7. Enforce input, ingestion-row, page, cell, query, export, and worker-message limits. Support cancellation and release every buffer, decoder handle, connection, registration, cursor, URL, and worker on close.
8. Add deterministic valid, compressed, nested, null, multi-block or multi-batch, malformed, truncated, range-sized, and unsupported fixtures as appropriate. Regenerate relational fixtures with `pnpm --filter @cagnard/frontend fixtures:data` and NetCDF fixtures with `pnpm --filter @cagnard/frontend fixtures:netcdf`.
9. Record every parser, Wasm, and DuckDB extension version, license, local asset hash, access model, codec/variant matrix, and upgrade test requirement in [structured-data runtime and limits](../architecture/structured-data-limits.md).
10. Add unit, backend classification, build, browser, filesystem, S3, responsive, accessibility, cancellation, cleanup, and all-theme coverage.

Storage credentials must never enter opener state, worker messages, logs, exports, or error details. Readers receive only an authorized same-origin content URL and safe entry metadata.

Iceberg-like multi-object formats also require a provider-neutral backend probe and a same-origin source facade. Resolve every referenced object beneath the selected authorized root and reject foreign buckets, credentialed URLs, absolute filesystem paths, external schemes, traversal, and encoded escapes before the browser sees a source URL.
