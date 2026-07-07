# Design: Add File Browser Pagination

## Approach

Pagination becomes part of the provider-neutral storage listing contract. The backend remains the authority for current-directory search, sorting, and page slicing. The frontend sends listing options and renders the returned page; it no longer filters or sorts the browser table from a partially loaded client-side collection.

The existing full `List(root, path)` behavior should remain available internally for operations that truly need a complete recursive view, such as transfer planning. Browser listing uses a new paginated operation.

## Backend API

`GET /api/storage/entries` keeps the same route but accepts additional query parameters:

- `pageSize`: requested page size, clamped by backend defaults and maximums.
- `pageRef`: opaque reference returned by a previous page response.
- `query`: current-directory search text.
- `sortKey`: one of `name`, `kind`, `type`, `size`, `modifiedTime`, `mimeType`, or `fileCategory`.
- `sortDirection`: `asc` or `desc`.

The response extends the existing `EntryListResponse` shape:

```json
{
  "root": {},
  "path": "folder",
  "entries": [],
  "page": {
    "pageSize": 100,
    "nextPageRef": "opaque",
    "totalCount": null,
    "filteredCount": null,
    "hasMore": true,
    "query": "report",
    "sortKey": "name",
    "sortDirection": "asc",
    "accuracy": {
      "search": "exact",
      "sort": "exact",
      "total": "unknown"
    }
  }
}
```

`totalCount` and `filteredCount` are optional. Providers should only set them when the value is cheap and exact. Unknown totals must be represented as unknown, not `0`.

## Page References

The browser receives opaque `pageRef` values. A page ref is a backend-signed envelope containing:

- tunnel and root id
- path
- query
- sort key and direction
- page size
- provider cursor payload
- issued timestamp and schema version

The backend validates that a submitted `pageRef` matches the active request context before using it. A ref from another root, path, query, sort, or page size is rejected with a safe error.

The provider cursor payload is not a browser contract. It can be an S3 continuation token, a filesystem offset/keyset cursor, or a future provider token. The encoded page ref does not require server-side persistence, preserving the stateless backend model.

The first implementation can sign but does not need to encrypt page refs. It must avoid placing credentials, secrets, or access keys in the cursor payload. If a provider cursor is sensitive in the future, the provider must either avoid exposing it through the cursor payload or the backend must add encryption before returning it.

## Storage Contract

Add provider-neutral listing types:

```go
type ListOptions struct {
    PageSize      int
    Cursor        *string
    Query         string
    SortKey       string
    SortDirection string
}

type ListAccuracy struct {
    Search string // exact, degraded, unsupported
    Sort   string // exact, degraded, unsupported
    Total  string // exact, unknown
}

type ListPage struct {
    Entries       []StorageEntry
    NextCursor    *string
    TotalCount    *int
    FilteredCount *int
    Accuracy      ListAccuracy
}
```

Extend `StorageProvider` with a browser listing method, for example:

```go
ListPage(root ResolvedStorageRoot, path string, options ListOptions) (ListPage, error)
```

To avoid broad disruption, the current full `List(root, path)` can remain for recursive transfers and providers can share helper functions between full and paginated listing.

## Sorting And Search Semantics

Filtering and sorting must happen before page slicing. The backend must not sort or filter only the current page and present that as a directory-wide result.

Supported sort keys map to normalized entry fields:

- `name`: entry name, case-insensitive with stable tie-breakers.
- `kind`: directory/file grouping, then name.
- `type`: display type/category fallback.
- `size`: known sizes first, missing values last, then name.
- `modifiedTime`: known timestamps first, missing values last, then name.
- `mimeType`: normalized MIME type, then name.
- `fileCategory`: classified file category, then name.

Search uses the same normalized haystack currently used by the frontend: name, path, kind, MIME type, file category, icon/type label, and safe provider-specific fields only where appropriate.

If a provider cannot satisfy a requested search or sort exactly without scanning beyond a configured safety limit, the backend must fail or explicitly report unsupported/degraded behavior. It must not silently return a partial result set.

## S3 Provider

S3 native pagination should be used for the default exact listing path:

- no search query
- sort by `name` ascending
- directory-like listing through `ListObjectsV2`
- `MaxKeys` derived from `pageSize`
- provider cursor maps to `NextContinuationToken`

S3 returns objects and common prefixes in key order. Cagnard still normalizes them into directory and file entries, deduplicates folder markers, and applies the root prefix boundary.

For non-native modes, S3 cannot sort by size, modified time, MIME type, or category using `ListObjectsV2`. It also cannot search arbitrary current-directory metadata without scanning. In those cases:

- Cagnard may scan S3 pages up to `maxListPages`.
- It applies filtering and sorting after the scan, then slices the requested page.
- If the scan reaches `maxListPages` before the directory is exhausted, the request fails with a clear message that the requested search/sort requires scanning more pages than configured.
- The response reports exact search and sort only when the scanned scope is complete.

This keeps default browsing scalable while preserving correctness for backend-driven search and ordering.

## Filesystem Provider

The Unix filesystem provider can implement exact backend search and sorting by reading the current directory entries, materializing normalized metadata, applying query and sort, then slicing by page size.

For page cursors, the first implementation can use an offset cursor signed inside the backend page ref. Because directories can mutate between requests, the response should not claim snapshot isolation. If stronger stability becomes necessary, the provider can move to keyset cursors based on sorted entry identity.

## Frontend State

`useCagnardData` should keep pagination state alongside path, filter, and sorting state:

- current `pageSize`
- current page index for display only
- current `nextPageRef`
- stack of previous page refs for back navigation
- current query
- sort key/direction

When path, query, sort, root, or page size changes, the frontend clears selection, resets page history, and loads the first page. When moving forward, it sends the current `nextPageRef`. When moving backward, it uses the frontend-managed page ref stack because providers such as S3 only expose forward cursors.

The URL should continue to represent the storage location. Pagination state does not need to be in the URL for the first implementation; reload should restore the location and load the first page with the current default sort.

## UI Behavior

The table renders only the current page. Existing row selection, one-click open, metadata display, inline quick view, pasteboard staging, and action enablement operate on visible page entries.

The file browser adds compact pagination controls near the search/count area:

- page size selector
- previous and next buttons
- count text that handles unknown totals, for example `1-100` or `1-100 of many`
- loading overlay using the existing pending-state pattern

Search and sort interactions trigger backend reloads instead of local transforms. Search should be debounced enough to avoid firing on every keystroke for large providers, while still feeling responsive.

Cross-page selection is out of scope for the first implementation. `Select visible entries` remains page-scoped and the label should make that clear.

## Compatibility And Migration

The API can be introduced compatibly by returning `page` metadata while preserving the existing `entries` field. Existing frontend code will be updated in the same change.

Provider tests and API tests should cover:

- default first page
- next-page ref validation
- reset behavior when query/sort changes
- filesystem exact query/sort before slicing
- S3 native continuation token usage
- S3 non-native scan limit failure

No persistent migrations are needed because page refs are stateless.
