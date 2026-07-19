# Testing And Validation

Changes should be validated at the narrowest useful level while being covered by the repository-wide checks before release.

## Core Commands

```bash
pnpm backend:test
pnpm --filter @cagnard/frontend test
pnpm --filter @cagnard/frontend typecheck
pnpm --filter @cagnard/frontend build
pnpm examples:check
pnpm docs:check
```

Run the combined check with:

```bash
pnpm check
```

## Backend

Go unit and API tests live under `backend-go`. Provider-independent tests must run without Docker. `TestS3MinIOStreamingIntegration` is enabled by `CAGNARD_S3_TEST_ENDPOINT` and belongs to the separate Docker-backed S3 provider CI job.

Task-engine changes should cover owner isolation, state transitions, item pagination, cancellation, partial mutations, and disconnect handling. Provider stream tests must include unknown content lengths and cancellation during I/O; S3 write changes also require multipart verification against MinIO.

## Frontend

Vitest covers focused state and contract behavior. TypeScript typecheck and the production Vite build catch integration and bundling failures. User-facing workflow changes also require browser verification at desktop and constrained widths.

For appearance changes, verify Classic light/dark and Solar light/dark, system-mode changes, reload persistence, operator lock, keyboard focus, status contrast, menus, dialogs, toasts, file openers, and responsive navigation.

Structured-data changes require equivalent relational results across maintained formats, adversarial SQL validation, cursor generations, cancellation isolation, source replacement, cleanup, and payload ceilings. Browser checks must cover the common Data/SQL/Schema/Metadata surface, grid overflow, popover layering, stable Run/Stop dimensions, keyboard names, and all four palette/mode combinations.

Regenerate maintained analytical fixtures with:

```bash
pnpm --filter @cagnard/frontend fixtures:data
pnpm --filter @cagnard/frontend fixtures:netcdf
```

The relational generator produces equivalent Parquet, Avro, CSV, TSV, NDJSON, Arrow IPC, and Feather records. The NetCDF generator requires the pinned packages in `frontend/scripts/requirements-netcdf-fixtures.txt` and covers classic, CDF-5, NetCDF-4, groups, compression, CF metadata, packed values, malformed input, and bounded large input. Iceberg fixtures under `examples/storage/global/iceberg` preserve multiple snapshots plus an escaping-reference rejection case. Keep the generated corpus deterministic and small; benchmarks generate temporary large data. NetCDF-C/HDF5 embeds creation times in the committed datatype of `unsupported-compound.nc4`, so that deliberately unsupported fixture is semantically deterministic but not byte-for-byte reproducible.

Iceberg backend tests must cover filesystem and S3-compatible roots, paginated metadata probes, range responses, relative and moved references, authorization, foreign buckets, credentials, schemes, traversal, and double-encoding. Any DuckDB, Iceberg extension, or NetCDF Wasm upgrade also requires a packaged-browser compatibility pass and refreshed local-asset hashes.

Task workflow changes require desktop and narrow-width browser checks for copy, move, recursive delete, direct and ZIP downloads, multi-file and directory uploads, conflict resolution, cancellation, queue pagination, and exact-location refresh. Inspect progress while operations are active rather than only their terminal state.

## Examples And Packaging

`scripts/validate-compose-examples.sh` renders every release-first Compose file and its source-build override. `scripts/validate-helm-examples.sh` lints/templates the chart with maintained values. Run actual smoke tests when changing container startup, proxying, providers, seeded data, or credentials.

Mocker is for local macOS image validation only. CI, release publishing, and runnable Compose examples use Docker.

## Documentation

`pnpm docs:check` validates local Markdown links and referenced assets. Also inspect README and documentation images at normal and narrow widths and verify that screenshots contain no credentials or private content.

## OpenSpec

Behavior changes use the OpenSpec artifact workflow. Before archiving a change, run strict validation for its change ID and ensure implementation decisions are reflected in its design/specs and in reader-facing documentation.
