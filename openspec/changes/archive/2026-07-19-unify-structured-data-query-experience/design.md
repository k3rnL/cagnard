## Context

Cagnard already ships a first-party structured-data viewer and reuses one lazy DuckDB-Wasm runtime per browser tab. Parquet has exact DuckDB-backed filtering, sorting, projection, and paging, while Avro, CSV/TSV, NDJSON, and Arrow/Feather use readers with narrower capabilities. This difference is visible in otherwise identical viewer controls and makes the product feel format-dependent.

The accepted direction adds a read-only SQL workspace, explicit Iceberg table opening from detected folders, and NetCDF support. Iceberg is a table metadata format whose files may refer to manifests and data objects; NetCDF is a multidimensional scientific model rather than a natural row table. Both must preserve Cagnard's provider-neutral authorization and default file-browser behavior. Browser memory, authenticated random access, extension loading, and arbitrary SQL are material security and performance constraints.

## Goals / Non-Goals

**Goals:**

- Present the same exact columns, filters, ordered sorts, paging, exports, and SQL workflow for relational formats whenever DuckDB can represent the complete source truthfully.
- Expose one controlled, read-only `data` relation per opened source without granting arbitrary filesystem, network, catalog, mutation, or extension access.
- Detect likely Iceberg table roots lazily, keep normal folder browsing as the default, and open compatible tables explicitly.
- Inspect NetCDF semantics, bounded multidimensional slices, and CF-decoded values without pretending the complete file is inherently relational.
- Keep processing cancellable and bounded, preserve the shared per-tab runtime, and clean up source-specific state deterministically.
- Reuse Cagnard's established tabs, tool buttons, badges, menus, popovers, data grids, loading states, focus treatment, responsive rules, and all supported themes.

**Non-Goals:**

- Editing or rewriting Parquet, Avro, Iceberg, NetCDF, Arrow, CSV, or NDJSON sources.
- Exposing unrestricted DuckDB SQL, arbitrary URLs, provider credentials, user-installed extensions, DDL, DML, `COPY`, `ATTACH`, `PRAGMA`, or table-producing storage functions.
- Automatically replacing a detected Iceberg folder with a table viewer.
- Supporting every Iceberg catalog, relocated table, delete-file version, NetCDF user-defined type, HDF5 feature, codec, projection, or calendar in the first release.
- Geographic map projections, NetCDF overlays, OPeNDAP, Zarr, or browser-side NetCDF editing.
- Materializing an entire unbounded NetCDF variable merely to enable SQL.

## Decisions

### Use a shared relational source adapter

The worker will expose a source adapter contract that can bind a source to a controlled DuckDB relation and separately report schema, metadata, exact capabilities, limits, and cleanup. Parquet, CSV/TSV, NDJSON, and supported Arrow inputs will use DuckDB readers when their access mode and size are safe. The existing Avro decoder will preserve Avro OCF schema and codec handling, emit bounded Arrow batches, and ingest those batches into a source-owned DuckDB relation.

The current generated filter/sort path and the SQL workspace will both query the same relation. This avoids divergent semantics between toolbar operations and SQL. A relation is advertised only after complete-file semantics are available; otherwise the adapter reports a truthful limited mode and retains its existing bounded reader.

Alternative considered: implement equivalent sort and filter logic separately in every decoder. That duplicates query semantics, still leaves SQL inconsistent, and raises correctness risk for nested values, nulls, and type coercion.

### Expose a controlled SQL workspace over `data`

The shared viewer will add `SQL` after `Data`, `Schema`, and `Metadata`. Iceberg may additionally expose `Snapshots`. The editor starts with an example query and can insert the current Data-view projection, filters, and ordered sorts as generated SQL. Data-view query state remains independent until the user explicitly inserts it.

Every source connection exposes exactly one documented relation named `data`. Before execution, SQL is parsed into an AST. The validator accepts one read-only `SELECT` or `WITH ... SELECT` statement, including expressions, aggregation, windows, subqueries, set operations, and self-joins over `data`. It rejects other relation names, table functions, external references, multiple statements, mutation, DDL, commands, pragmas, attachment, copying, extension operations, and unsupported AST nodes. Defense in depth disables DuckDB external access and automatic extension installation for the user-query connection.

The worker wraps validated queries with a configured result-row and payload ceiling, pages result batches, applies a timeout, and supports interruption. The Run button retains its dimensions, shows progress in place, and exposes Stop while running by pointer and accessible name. Query errors appear inside the SQL workspace with safe detail; diagnostics remain in development/server logs without source content or credentials.

Alternative considered: permit arbitrary `SELECT` text because the engine runs in Wasm. DuckDB `SELECT` can invoke table functions and external readers, so statement-kind validation alone is not a sufficient boundary.

### Lazily detect Iceberg without changing folder navigation

Iceberg probing will be lazy for the current folder or an explicitly inspected folder, not an extra recursive request for every listed row. A stateless provider-neutral backend probe checks an authorized folder for a `metadata` directory and credible Iceberg metadata signals, such as metadata JSON and version information. The probe returns `not-detected`, `candidate`, `supported`, or `unsupported` with a safe reason. DuckDB performs final table validation when opening.

The folder continues to open as a folder on normal activation. After the user navigates inside a candidate table root and detection completes, an **Open as Iceberg table** action appears first in the current-folder toolbar. It never becomes the row's default action and does not require selecting the folder from its parent.

The Iceberg adapter uses DuckDB-Wasm's bundled, pinned Iceberg support after a compatibility spike verifies the exact package version, browser asset packaging, authenticated reads, metadata versions, manifests, data files, and cancellation. A same-origin source facade maps table-relative reads to the authorized Cagnard root and denies references outside that root. Tables whose metadata requires unsupported external catalogs, credentials, paths, or features remain browsable as folders and receive an actionable unsupported state.

Alternative considered: infer Iceberg solely from the visible paginated folder listing. Required metadata may not be on that page, and eager probing every row would make ordinary browsing slower.

### Model Iceberg snapshots explicitly

An opened table binds `data` to its current snapshot by default and exposes data, schema, metadata, snapshots, and SQL. The Snapshots view lists stable identifiers, parent relationships, operation, commit time, and summary fields available from metadata. Selecting a supported snapshot intentionally rebinds `data`, clears stale result cursors, and updates Data and SQL context. Unsupported snapshot/delete semantics are reported rather than silently ignored.

Alternative considered: show only current table rows. Snapshot visibility is central to understanding Iceberg state and makes the selected SQL relation unambiguous.

### Use a NetCDF semantic reader before DuckDB

NetCDF detection distinguishes CDF-1, CDF-2, CDF-5, and NetCDF-4/HDF5 candidates by content signature and validates NetCDF semantics before opening. A `NetCDFReader` facade normalizes groups, dimensions, variables, coordinate variables, attributes, types, chunking, compression, fill values, and bounded hyperslab reads. Generic HDF5 nodes are not presented as NetCDF unless the semantic reader validates them.

The first implementation begins with a compatibility spike against representative classic and NetCDF-4 fixtures. It evaluates a NetCDF-C-based Wasm reader as the preferred unified semantic implementation, with a classic parser and HDF5 Wasm adapter considered only if one dependency cannot satisfy browser random access, supported variants, packaging, and cleanup. The selected reader remains behind the facade so dependency limitations do not leak into UI contracts.

Alternative considered: use a generic HDF5 browser directly. NetCDF-4 uses HDF5 storage, but HDF5 structure alone does not correctly supply NetCDF dimensions, coordinate semantics, conventions, and decoding rules.

### Make the NetCDF Data view variable- and slice-oriented

The Data view initially presents a compact variable catalog with group, name, dimensions, shape, type, units, standard name, and role. Selecting a variable adapts the view:

- scalar variables show a typed value;
- one-dimensional variables show a line plot and accessible table;
- two-dimensional variables show a heatmap and accessible table;
- variables with three or more dimensions require X/Y display dimensions and coordinate/index selectors for every remaining dimension.

CF metadata preselects recognized time, vertical, latitude, and longitude axes. Decoded values apply missing/fill handling, scale factor, and offset in the defined order, while a Raw values toggle preserves inspection of stored values. The view reports active group, variable, slice, units, and decoded/raw mode. Charts use stable responsive bounds, themed contrast, keyboard-reachable controls, textual values, and a table fallback; they do not introduce floating decorative surfaces or obscure existing actions.

Alternative considered: flatten every variable immediately. Multidimensional Cartesian expansion can create billions of rows and loses the intentional slice used for scientific inspection.

### Materialize only an explicit NetCDF relational projection

For SQL, filters, sorts, and export, the NetCDF adapter converts the selected bounded slice into Arrow batches. Dimension coordinate values become columns and selected compatible variables sharing those dimensions become value columns. The DuckDB relation is named `data`, but the UI labels its scope as **Current slice**, displays dimensions and row count, and invalidates it whenever selection or decoding mode changes.

The adapter enforces configured limits for source bytes, hyperslab cells, relational rows, Arrow payload, and query results. If the requested projection exceeds a limit, the user must narrow dimensions or variables; Cagnard does not silently sample or imply complete-file SQL. CSV/JSON and optional Arrow/Parquet exports follow the same bounded projection.

Alternative considered: expose one table per NetCDF variable. This complicates the safe SQL namespace and makes coordinate joins ambiguous. A deliberate compatible-variable projection keeps `data` predictable.

### Preserve random access and truthful fallbacks

Readers use Cagnard's authenticated same-origin range endpoint where their runtime supports random access. The NetCDF spike must verify real HTTP range behavior for classic and chunked NetCDF-4 files on filesystem and S3 providers. A reader that requires full buffering receives a configurable ceiling and fails early above it while preserving metadata and original download actions where possible.

Iceberg and NetCDF capability reports distinguish exact, bounded, degraded, and unsupported behavior. No source is reported as queryable before metadata, referenced-object authorization, codec/type support, and limits have been validated.

### Keep the viewer visually and behaviorally unified

The implementation reuses existing structured tabs, command groups, badge counts, row-limit control, column selector, query editors, data grid, button hover border, modal/popover dismissal, focus rings, and theme tokens. Format-specific controls occupy the same bounded command surface. Popovers render above grids and side panels, remain reachable across their pointer bridge, dismiss on outside click and Escape, and never rely on hover alone.

Tabs and command rows retain stable dimensions while workers initialize or queries run. Wide tables scroll within the grid; variable selectors and slice controls wrap or collapse into labeled groups at medium and mobile widths. Browser verification covers desktop, mobile, all themes, keyboard focus, loading, cancellation, empty/error states, popover layering, and chart/table overflow.

Alternative considered: build separate Iceberg and NetCDF pages. That would repeat controls and recreate the inconsistent experience this change is intended to remove.

### Generate a compatibility corpus and document the limits

Fixtures will include all existing relational formats with equivalent records; Iceberg tables with multiple snapshots and representative metadata versions; and NetCDF classic, 64-bit offset, CDF-5, NetCDF-4 classic/enhanced model, groups, unlimited dimensions, chunking/compression, CF coordinates/calendars, packed/missing data, and malformed or unsupported cases. Large fixtures exercise cancellation, range reads, memory limits, and paged results on filesystem and S3 examples.

User documentation will explain supported formats, opening Iceberg explicitly, NetCDF slicing and decoded values, SQL's `data` relation, current-slice semantics, limits, exports, and fallbacks. Developer documentation will cover adapters, security validation, adding a relational format, reader compatibility, worker lifecycle, and fixture generation.

## Risks / Trade-offs

- [The pinned DuckDB-Wasm build may not support required Iceberg paths in browser deployments] -> Make compatibility validation the first Iceberg task, pin verified local assets, and keep detected folders fully usable when table opening is unavailable.
- [Iceberg metadata can reference objects outside the selected storage root] -> Resolve through a same-origin authorized facade and reject external or escaping references rather than forwarding credentials or URLs.
- [SQL validation can miss an unsafe DuckDB construct] -> Use AST allowlisting plus disabled external access, disabled extension installation, one source-owned connection, one exposed relation, bounded execution, and adversarial tests.
- [Avro or sequential ingestion can consume substantial memory before exact querying] -> Stream bounded Arrow batches, enforce ingestion ceilings, report limited mode when exact complete-file ingestion is unsafe, and never label page-local operations as global.
- [NetCDF browser libraries have uneven classic, HDF5, codec, and random-access support] -> Gate selection on a fixture-and-range spike behind a reader facade and publish the verified compatibility matrix.
- [A multidimensional slice can still expand explosively] -> Require explicit selections, calculate cell and row counts before reading, enforce multiple configurable ceilings, and retain variable metadata when data loading is refused.
- [CF metadata can be absent or contradictory] -> Apply CF conveniences only when validated, expose raw metadata and manual dimension selection, and identify inferred choices.
- [Shared DuckDB state can leak resources or source names] -> Preserve unique source IDs, source-owned connections and registrations, isolated cancellation, idempotent cleanup, and runtime recovery tests.
- [Additional controls can overcrowd the opener] -> Reuse bounded responsive groups, keep format-specific actions contextual, and verify screenshots and interactions before completion.

## Migration Plan

1. Add generated compatibility fixtures and run DuckDB Iceberg and NetCDF reader/range spikes before selecting or upgrading dependencies.
2. Introduce the shared relational adapter and migrate existing generated Data-view operations without exposing SQL.
3. Add the validated SQL workspace and security tests, then enable it format by format as each adapter provides exact `data` semantics.
4. Add lazy Iceberg probing and explicit folder action, followed by table metadata, snapshot, data, and SQL views.
5. Add the NetCDF semantic reader, variable catalog, bounded slices, decoded values, plots/tables, and finally current-slice DuckDB projection.
6. Update fixtures, examples, documentation, supported-format matrices, dependency notices, and packaged worker/Wasm assets.
7. Run frontend, backend, integration, filesystem/S3, security, cancellation, responsive, accessibility, and all-theme browser verification.

Each adapter is additive and can be disabled independently if rollback is required. Existing bounded readers remain available until their DuckDB-backed replacement passes parity tests; folder browsing never depends on Iceberg support.

## Open Questions

None. Exact dependency versions and the NetCDF reader implementation are deliberately selected by the mandatory compatibility spikes against the specified contract rather than by unsupported assumption.
