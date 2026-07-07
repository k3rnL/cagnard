## ADDED Requirements

### Requirement: S3 paginated directory listing
Cagnard SHALL use S3-compatible native pagination for browser-facing object and common-prefix listings when the requested listing criteria can be represented by S3 listing semantics.

#### Scenario: Use S3 continuation token
- **WHEN** the browser requests the default first page of an S3 directory-like location
- **THEN** the S3 provider SHALL call `ListObjectsV2` with a bounded page size and return a provider cursor derived from `NextContinuationToken` when another page exists

#### Scenario: Continue S3 listing
- **WHEN** the browser requests the next S3 page using a backend page reference
- **THEN** Cagnard SHALL validate the page reference and pass the decoded S3 continuation token to the S3 provider

#### Scenario: Keep directory-like semantics
- **WHEN** an S3 listing page contains objects, common prefixes, or folder markers
- **THEN** Cagnard SHALL normalize them into provider-neutral file and directory entries without exposing objects outside the configured root prefix

#### Scenario: Avoid full-prefix scan for native page
- **WHEN** the listing uses default name ordering with no search query
- **THEN** the S3 provider SHALL NOT fetch every page in the prefix merely to render the first browser page

### Requirement: S3 searched and non-native sorted listing
Cagnard SHALL preserve correctness when users request search or sorting that S3 cannot satisfy natively.

#### Scenario: Scan for non-native criteria
- **WHEN** the user searches or sorts an S3 directory by size, modified time, MIME type, file category, or another non-native key
- **THEN** Cagnard MAY scan S3 pages up to the configured provider limit, apply criteria to the complete scanned directory scope, and then return the requested page

#### Scenario: Stop at configured scan limit
- **WHEN** an S3 search or non-native sort reaches the configured maximum list pages before exhausting the directory scope
- **THEN** Cagnard SHALL fail the listing with a safe diagnostic that the requested criteria require scanning more S3 pages than allowed

#### Scenario: Report exact S3 result
- **WHEN** an S3 search or non-native sort completes after scanning the full current directory scope
- **THEN** Cagnard SHALL report search and sort accuracy as exact for the returned page

## MODIFIED Requirements

### Requirement: S3 directory-like listing
Cagnard SHALL present S3 objects and common prefixes as provider-neutral storage entries using directory-like navigation semantics and browser-facing pagination.

#### Scenario: List common prefixes
- **WHEN** the S3 provider lists a location containing common prefixes
- **THEN** Cagnard SHALL return those prefixes as directory entries with paths relative to the configured root and within the current listing page

#### Scenario: List objects
- **WHEN** the S3 provider lists a location containing objects
- **THEN** Cagnard SHALL return those objects as file entries with paths relative to the configured root and within the current listing page

#### Scenario: Deduplicate folder markers
- **WHEN** a zero-byte folder marker and a common prefix describe the same directory-like path
- **THEN** Cagnard SHALL return a single directory entry for that path without corrupting page continuation behavior
