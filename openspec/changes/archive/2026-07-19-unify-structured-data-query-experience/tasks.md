## 1. Compatibility Spikes And Fixtures

- [x] 1.1 Generate equivalent Parquet, Avro OCF, CSV, TSV, NDJSON, Arrow IPC, and Feather fixtures with nulls, nested values, logical types, and enough rows to verify exact filter, sort, paging, and SQL parity.
- [x] 1.2 Build representative local Iceberg fixtures with multiple snapshots, metadata versions, manifests, Parquet data, and at least one deliberately unsupported or escaping reference.
- [x] 1.3 Verify the pinned DuckDB-Wasm Iceberg extension in the packaged browser against authenticated filesystem and S3 range endpoints, cancellation, current and historical snapshots, and locally served worker/Wasm assets; document the compatibility result before changing its version.
- [x] 1.4 Generate NetCDF classic, 64-bit offset, CDF-5, NetCDF-4 classic/enhanced, grouped, unlimited-dimension, chunked/compressed, CF-coordinate, packed/missing-value, malformed, and large-file fixtures from deterministic source data.
- [x] 1.5 Compare candidate NetCDF semantic readers against the fixture corpus for browser packaging, variants, groups, types, codecs, bounded hyperslabs, HTTP range behavior, cancellation, and cleanup, then record and pin the selected adapter dependencies.
- [x] 1.6 Add generated structured, Iceberg, and NetCDF fixtures to the filesystem and MinIO examples without committing private or impractically large data.

## 2. Shared Relational Source Runtime

- [x] 2.1 Extend the structured worker protocol with source relation binding, relation scope, exact capabilities, paged query batches, cancellation, and source-owned cleanup messages.
- [x] 2.2 Implement a shared relational source adapter that exposes one source-owned `data` relation, schema and metadata access, configured bounds, and deterministic cleanup on the existing per-tab DuckDB runtime.
- [x] 2.3 Route supported Parquet, CSV/TSV, NDJSON, and Arrow/Feather sources through exact DuckDB relations while retaining safe format-specific metadata and bounded fallback modes.
- [x] 2.4 Stream supported Avro OCF blocks through the existing decoder into bounded Arrow batches and a source-owned DuckDB relation while preserving Avro schema, unions, logical types, codecs, and errors.
- [x] 2.5 Make Columns, filters, ordered multi-column sorts, pagination, counts, and bounded exports consume the shared relation capability without changing truthful unsupported or degraded states.
- [x] 2.6 Add worker and adapter tests for cross-format query parity, nested and null values, ingestion ceilings, cursor invalidation, cancellation isolation, cleanup, and runtime recovery.

## 3. Controlled SQL Workspace

- [x] 3.1 Add a SQL parser and AST allowlist that accepts one supported read-only `SELECT` or `WITH ... SELECT` over `data` and rejects other relations, table functions, external access, multiple statements, mutation, commands, pragmas, attachment, copying, extension operations, and unknown nodes.
- [x] 3.2 Configure the user-query connection with external access and automatic extension installation disabled and verify that provider credentials, other source registrations, arbitrary URLs, and browser-local files are unreachable.
- [x] 3.3 Implement bounded SQL execution, typed paged results, result and payload limits, timeout, interruption, stale-result invalidation, and safe user versus diagnostic errors in the worker.
- [x] 3.4 Add the `SQL` tab with an editor, accessible Run/Stop control, stable in-button progress, scope summary, inline errors, result grid, and paging that reuse existing structured viewer components and theme tokens.
- [x] 3.5 Implement **Insert current view** to generate editable SQL from the active projection, filters, and ordered sorts without silently modifying or executing existing SQL text.
- [x] 3.6 Add adversarial SQL security tests plus UI tests for analytical expressions, CTEs, aggregations, windows, subqueries, set operations, self-joins, cancellation, limits, errors, and source changes.
- [x] 3.7 Add theme-aware SQL syntax coloring through a synchronized accessible editor layer without changing query execution or native editing behavior.

## 4. Iceberg Detection And Authorized Access

- [x] 4.1 Add a stateless provider-neutral backend Iceberg probe for an authorized folder that checks metadata signals independently of the visible paginated listing and returns not-detected, candidate, supported, or unsupported details.
- [x] 4.2 Add provider-neutral probe tests for filesystem roots, S3 prefixes, pagination, missing or malformed metadata, access denial, and ordinary non-table folders.
- [x] 4.3 Implement an authorized same-origin Iceberg source facade for metadata, manifests, and data files that confines resolution to the selected root and rejects external, credentialed, or escaping references.
- [x] 4.4 Add security and integration tests for relative, moved, absolute, escaping, unauthorized, filesystem, and S3 Iceberg object references based on the verified DuckDB compatibility matrix.
- [x] 4.5 Extend folder capability state and caching so probing is lazy, refreshable, cancelable, and does not add eager requests or layout churn to each browser row.

## 5. Iceberg Table Viewer

- [x] 5.1 Add **Open as Iceberg table** as an explicit contextual folder action while preserving single-click folder navigation as the default and retaining the folder browser after unsupported or failed table opening.
- [x] 5.2 Implement the Iceberg source adapter on the shared DuckDB runtime with current-snapshot `data`, schema, table metadata, bounded queries, cancellation, and source cleanup.
- [x] 5.3 Add the Snapshots view with identifiers, ancestry, commit time, operation, summaries, selected state, and accurate unsupported semantics.
- [x] 5.4 Implement snapshot selection so it deliberately rebinds `data`, invalidates stale Data and SQL cursors, and updates visible scope before new operations run.
- [x] 5.5 Add Iceberg viewer tests for opening, current and historical snapshots, exact filters and ordered sorts, SQL, cancellation, unsupported metadata/delete semantics, and graceful return to folder browsing.
- [x] 5.6 Probe the current browsed folder and expose **Open as Iceberg table** as the first toolbar action without requiring parent-folder selection.

## 6. NetCDF Semantic Reader

- [x] 6.1 Extend frontend and backend type catalogs with maintained NetCDF MIME aliases, practical extensions, CDF signatures, NetCDF-4 semantic validation, variant labels, and separation from generic HDF5.
- [x] 6.2 Implement the selected NetCDF reader behind a facade for source open, groups, dimensions, variables, coordinate variables, attributes, types, shape, chunks, compression, fill metadata, bounded hyperslabs, and cleanup.
- [x] 6.3 Connect the reader to authenticated same-origin bounded or range reads on filesystem and S3, with explicit configurable full-buffer, hyperslab-cell, byte, row, and worker-payload ceilings.
- [x] 6.4 Implement CF-aware coordinate recognition, supported calendar and unit presentation, missing/fill handling, scale and offset decoding, raw-value mode, and explicit handling of absent or contradictory metadata.
- [x] 6.5 Add reader tests for every generated variant, groups, unlimited dimensions, chunking/codecs, supported types, CF coordinates, packed values, malformed and truncated input, unsupported features, range behavior, cancellation, limits, and cleanup.

## 7. NetCDF Variable And Slice Experience

- [x] 7.1 Register the first-party NetCDF opener with candidate content validation, read-only capability declarations, safe unsupported fallback, and lazy loading outside the initial browser bundle.
- [x] 7.2 Build the Data-view variable catalog with group, name, dimensions, shape, type, units, standard name, inferred role, search, and bounded rendering.
- [x] 7.3 Build Schema and Metadata views that preserve groups, dimensions, coordinate relationships, supported user-defined types, and distinct global, group, and variable attributes.
- [x] 7.4 Implement explicit X/Y display dimensions and coordinate, index, or bounded-range selectors for remaining dimensions, including CF-informed defaults and pre-read cell/byte limit validation.
- [x] 7.5 Implement scalar, accessible 1D line, 2D heatmap, and tabular slice views with decoded/raw state, units, stable responsive dimensions, themed contrast, readable labels, and keyboard-reachable controls.
- [x] 7.6 Add NetCDF UI tests for variable and group navigation, slice changes, CF defaults and overrides, decoded/raw values, empty and unsupported states, cancellation, limit feedback, plot/table parity, and source cleanup.

## 8. NetCDF Relational Projection

- [x] 8.1 Convert a selected bounded NetCDF slice into Arrow batches whose columns contain dimension coordinates or indices and the selected variable value.
- [x] 8.2 Support multiple selected variables only when their active dimensions and coordinates are compatible, and provide an actionable incompatibility state instead of an implicit join.
- [x] 8.3 Bind the bounded projection as `data`, label it **Current slice**, show variables, dimensions, decoded/raw mode and row count, and invalidate it on every relevant slice change.
- [x] 8.4 Enable exact filters, ordered sorts, SQL, and bounded CSV/JSON plus supported Arrow/Parquet exports over the current slice without implying complete-variable coverage.
- [x] 8.5 Add projection tests for coordinate columns, compatible variables, null and decoded values, row expansion, configured ceilings, invalidation, exports, SQL, cancellation, and source replacement.

## 9. Integrated UI And Configuration

- [x] 9.1 Reuse existing tabs, tool buttons, badge counts, popovers, query editors, data grids, hover-border treatment, focus states, and theme tokens for every new control instead of introducing format-specific visual conventions.
- [x] 9.2 Keep toolbar and tab dimensions stable during initialization and execution; keep grid overflow local; ensure popovers layer above grids and side panels, bridge pointer gaps, dismiss on outside click and Escape, and never depend on hover alone.
- [x] 9.3 Add and validate documented stateless configuration defaults and ceilings for relational ingestion, SQL time/results, Iceberg metadata, NetCDF buffering/hyperslabs, plots, and exports without exposing unsafe browser overrides.
- [x] 9.4 Verify keyboard navigation, accessible names, focus order, contrast, reduced-motion behavior, loading, cancellation, empty/error states, and responsive control grouping across the integrated viewer.

## 10. Documentation And End-To-End Verification

- [x] 10.1 Update the user guide and supported-format matrix for unified operations, SQL syntax and restrictions, `data` scope, Iceberg detection and snapshots, NetCDF variables and slices, decoded/raw values, limits, exports, and fallbacks.
- [x] 10.2 Update developer documentation for relational and NetCDF adapters, SQL security, Iceberg source authorization, worker lifecycle, configuration, adding formats, generated fixtures, and dependency compatibility.
- [x] 10.3 Update runnable filesystem and MinIO example documentation so users can open equivalent relational files, a sample Iceberg table, and NetCDF fixtures from a fresh deployment.
- [x] 10.4 Run frontend typecheck, unit and production builds; backend unit tests; fixture generation; filesystem and S3 integration tests; and packaged worker/Wasm asset validation.
- [x] 10.5 Use the in-app browser to verify relational, Iceberg, and NetCDF workflows at desktop, medium, and mobile viewports in every supported light and dark theme, including screenshots and checks for overflow, layering, stable dimensions, focus, hover, cancellation, and nonblank plots.
- [x] 10.6 Confirm no provider credential, external URL, unsafe SQL, unbounded buffer, stale relation, source resource, or unsupported semantic path is exposed by the completed implementation, and keep all OpenSpec-driven documentation current.
