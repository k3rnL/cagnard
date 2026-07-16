# Adding A First-Party File Opener

File opener behavior is owned by the frontend source tree. Do not add a HOCON selector or backend manifest endpoint.

1. Add or update MIME, extension, category, label, and icon mappings in both `backend-go/internal/storage/filetype.go` and `frontend/src/openers/fileTypeCatalog.ts`.
2. Add a typed descriptor in `frontend/src/openers/fileOpeners.ts`. Use specific MIME/extension rules for formats sharing a broad category.
3. Keep small maintained surfaces inline. Put large parsers, workers, and WASM behind a dynamic import and verify the initial bundle does not include them.
4. Normalize analytical readers through `frontend/src/formats/models.ts` and the worker protocol. Declare only exact operations; do not label visible-page sorting as whole-file sorting.
5. Enforce input, page, cell, and worker-message limits. Support cancellation and release every buffer, connection, URL, and worker on close.
6. Add deterministic valid, compressed, nested, null, multi-block or multi-batch, malformed, truncated, and range-sized fixtures as appropriate. Regenerate the maintained data set with `pnpm --filter @cagnard/frontend fixtures:data`.
7. Add unit, backend classification, build, browser, filesystem, S3, responsive, accessibility, and all-theme coverage. Record the dependency license and supported format/codec matrix.

Storage credentials must never enter opener state, worker messages, logs, exports, or error details. Readers receive only an authorized same-origin content URL and safe entry metadata.
