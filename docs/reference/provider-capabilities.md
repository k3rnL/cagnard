# Provider Capability Reference

Capabilities describe what the active root can do and whether Cagnard uses a native or degraded implementation. Entry-specific restrictions can further reduce the available actions.

| Area | Unix filesystem | S3-compatible storage |
| --- | --- | --- |
| Browse/stat/metadata | Supported | Supported; object metadata varies by service |
| Provider-backed pagination | Exact in-process pages | Native continuation for name order; bounded scan for other queries |
| Search and sort | Exact for current directory | May be degraded for non-native ordering/search |
| Upload/download | Supported | Supported |
| Stream read/write | Supported | Supported |
| Range read | Supported | Supported when endpoint honors ranges |
| Create folder | Native directory | Prefix marker / virtual prefix semantics |
| Rename/move | Native filesystem operation where possible | Degraded copy then delete |
| Recursive delete | Supported | Prefix enumeration and object deletion |
| Same-root copy | Native filesystem copy | Object copy |
| Cross-provider copy | Backend stream | Backend stream |
| Watch/follow | Native filesystem notifications | Degraded backend polling |
| Owner/permissions | Filesystem metadata where available | Usually unavailable or provider-specific |
| Version/retention/encryption | Filesystem/provider dependent | Returned when API/endpoint exposes it |

The runtime API returns `supported`, `degraded`, or `unsupported` with explanatory text. The table is a product-level baseline, not a promise for every mount, bucket policy, S3 clone, or object.

## Common Capability Names

Cagnard uses capabilities for list, metadata/stat, preview/download, upload, create folder, rename, delete, copy, move, stream read/write, range read, and watch. UI openers can declare required names; action controls also consider root read-only state and selected-entry capability state.

## Accuracy And Metadata

Listing responses separately describe search, sort, and total-count accuracy. A provider can support pagination while reporting approximate or unavailable totals. The frontend must not infer an exact result count from one page.

Metadata fields include size, MIME type and source, owner, permissions, modified time, version, retention, encryption, file category, and icon. Missing fields are explicit and should remain absent rather than fabricated.

## Provider-Specific Behavior

Provider-specific metadata may be returned alongside normalized fields. It should enhance details without controlling the whole browser. New provider features should first ask whether they map to a normalized capability; truly unique operations can be exposed as scoped provider actions.
