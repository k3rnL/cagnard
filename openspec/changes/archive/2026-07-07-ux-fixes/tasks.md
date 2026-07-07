# Tasks: UX Fixes

- [x] Extend browser state so page-level opened files contribute a terminal, non-directory breadcrumb segment.
- [x] Update breadcrumb rendering so opened-file crumbs are current display state while ancestor crumbs remain navigable.
- [x] Add URL/history state for opened-file views without changing inline quick-view history behavior.
- [x] Handle native browser `popstate` to restore root, directory path, and page-level opened file state.
- [x] Prevent duplicate history entries during URL restore and state reconciliation.
- [x] Add or update focused frontend tests where practical, or document manual in-app browser validation if the current test setup lacks coverage.
- [x] Update feature documentation for opened-file breadcrumbs and native browser navigation.
- [x] Run frontend validation.
