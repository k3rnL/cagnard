# Tasks: Add File Browser Pagination

- [x] Add provider-neutral paginated listing models, list options, accuracy metadata, and backend page-reference encoding/validation.
- [x] Update the storage API response and `/api/storage/entries` handler to accept page size, page reference, search query, sort key, and sort direction.
- [x] Implement exact filesystem pagination with backend-side search and sorting before page slicing.
- [x] Implement S3 native continuation-token pagination for default browsing and bounded full-scope scanning for search or non-native sorting.
- [x] Update backend API/storage tests for pagination, invalid page references, filesystem search/sort, and S3 continuation behavior.
- [x] Update frontend API types/client and browser state so search, sorting, page size, next, and previous page requests are backend-driven.
- [x] Add file browser pagination controls and page-scoped selection/count messaging.
- [x] Update feature documentation for paginated browsing behavior and provider limitations.
- [x] Run full backend/frontend validation.
