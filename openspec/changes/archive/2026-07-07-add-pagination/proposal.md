# Proposal: Add File Browser Pagination

## Why

Cagnard's file browser currently treats directory listings as a fully loaded client-side collection. That works for small local folders, but it breaks down for large buckets, large directories, and object-store prefixes where providers naturally expose paginated listing APIs. It also makes current-directory search and column sorting misleading once only part of a directory is loaded.

Pagination must become a backend/provider concern. The frontend should request pages from the backend, and providers should return an opaque continuation reference that lets Cagnard fetch the next page without encoding provider-specific paging state in the UI.

## Goals

- Add paginated file browsing for the active directory.
- Move current-directory search/filter and column sorting to the backend so results are correct across the whole directory, not only the currently loaded page.
- Extend the provider-neutral storage listing contract to return page metadata and an opaque next-page reference.
- Support provider-native continuation references, especially S3 `ContinuationToken`, without exposing provider internals to the frontend.
- Preserve existing browser behavior for selection, breadcrumbs, one-click open, metadata display, pasteboard operations, and task queue interactions.
- Keep provider implementations free to support strong pagination natively or use a bounded fallback where native pagination is unavailable.

## Non-Goals

- Do not implement global cross-root search in this change.
- Do not add durable server-side pagination sessions or a database.
- Do not expose raw provider continuation tokens directly to the browser when they may contain provider-sensitive implementation details.
- Do not redesign the file table or navigation shell beyond the controls needed for page navigation and page-size handling.
- Do not require every provider to support every sort key natively in the first implementation.

## Scope

### Backend Listing API

The storage browser list endpoint should accept listing options:

- `path`
- `pageSize`
- `pageRef` or equivalent opaque continuation reference
- `query` for current-directory search/filter
- `sortKey`
- `sortDirection`

The response should include:

- entries for the current page
- next-page reference when another page exists
- previous-page behavior when supported or a frontend-managed page history when not
- total count only when the provider can compute it cheaply
- normalized indication of whether search, sort, and totals are exact or degraded

### Provider Contract

The storage provider interface should grow a paginated listing operation that returns a `ListingPage` rather than only `[]StorageEntry`.

The continuation reference must be provider-neutral at the API boundary. Internally, providers may use native cursors/tokens:

- S3 can map to `ListObjectsV2` continuation tokens.
- Unix filesystem can implement stable offset/keyset pagination after applying backend-side filtering and sorting.
- Future providers can return native page tokens, offsets, snapshots, or degraded markers according to their capabilities.

### Search And Sorting

Current-directory search and column sorting must be performed before page slicing. This means the backend/provider must apply `query`, `sortKey`, and `sortDirection` to the full current directory scope when possible.

For providers that cannot apply a requested sort natively, Cagnard may fall back to a bounded full listing for that directory or report the sort as unsupported/degraded. It must not silently sort only the current page and present that as full-directory ordering.

### Frontend Browser UX

The file browser should render one page at a time while keeping the current table interactions familiar:

- page size control or sensible default page size
- next/previous controls
- loading state that does not insert rows
- clear feedback when total count is unknown
- selection state scoped safely to visible entries unless later design explicitly supports cross-page selection
- search and sort controls bound to backend requests

Sorting by column should reload from the first page for the new sort order. Searching should also reload from the first page and preserve the URL/location behavior already implemented.

## Impacted Specs

- `storage-browser`: file listing pagination, backend search/filter, backend sorting, page navigation UX.
- `storage-plugin-system`: provider-neutral paginated listing contract and provider continuation references.
- `s3-storage-provider`: native S3 continuation-token integration for object and common-prefix listing.

## Risks

- Offset pagination can be unstable while directories mutate. The design should prefer provider/native continuation tokens where available and document mutation behavior.
- Some providers cannot sort by size, modified time, MIME type, or category without listing all children. The API needs explicit degraded/unsupported reporting.
- Search over object-store prefixes may require scanning multiple pages unless provider-native search exists. Cagnard must avoid pretending partial scans are complete.
- Cross-page multi-selection could be confusing. The first implementation should either scope selection to the visible page or make cross-page selection explicit.
- Opaque page references must be tamper-resistant enough for the stateless backend model, or safely validated before use.

## Validation

- Verify browsing a directory with more than one page loads the first page and can navigate forward.
- Verify S3 listing uses provider continuation tokens and does not fetch the full prefix just to render the first page.
- Verify Unix filesystem listing applies search and sorting before page slicing.
- Verify sorting by name, size, modified time, type, MIME type, and category is backend-driven or clearly reported as degraded/unsupported.
- Verify search filters the full current directory, not only currently visible rows.
- Verify selection, open, download, pasteboard add, delete, rename, and metadata display still work on paginated results.
- Verify URL navigation and reload preserve the current location and reset pagination predictably.
- Add focused backend tests for paginated listing, search, sorting, cursor validation, S3 continuation handling, and filesystem fallback behavior.
