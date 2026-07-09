## Purpose

Defines searching within a single file's content, distinct from directory or filename search, including regular-expression and case-sensitivity options and bounded result reporting.

## Requirements

### Requirement: Search within file content
Cagnard SHALL allow searching within a single opened file's content, distinct from directory or filename search, when the selected opener and storage entry support content access.

#### Scenario: Search opened text-like file
- **WHEN** the user searches within an opened text, log, or other text-capable opener
- **THEN** Cagnard SHALL return matching locations within that file's content without changing the active directory listing or its search/sort state

#### Scenario: No content-search support
- **WHEN** the active opener or storage entry does not support content search
- **THEN** Cagnard SHALL disable or hide in-file search rather than silently returning no results

### Requirement: Content search options
Cagnard SHALL support regular-expression and case-sensitivity options for content search.

#### Scenario: Regex search
- **WHEN** the user enables regular-expression search and enters a valid pattern
- **THEN** Cagnard SHALL return matches evaluated as a regular expression against the file content

#### Scenario: Invalid regex pattern
- **WHEN** the user enables regular-expression search and enters an invalid pattern
- **THEN** Cagnard SHALL report the pattern as invalid without failing the surrounding opener

#### Scenario: Case-sensitive search
- **WHEN** the user enables case-sensitive search
- **THEN** Cagnard SHALL only return matches with exact case correspondence

#### Scenario: Case-insensitive default
- **WHEN** the user searches without enabling case sensitivity
- **THEN** Cagnard SHALL match regardless of letter case

### Requirement: Bounded content search results
Cagnard SHALL bound the amount of work and content scanned per content-search request and SHALL report when results are incomplete.

#### Scenario: Match count exceeds bound
- **WHEN** a content search would return more matches than the configured per-request bound
- **THEN** Cagnard SHALL return the bounded set of matches and indicate that more matches may exist

#### Scenario: Continue search past bound
- **WHEN** the user requests further matches after receiving a bounded result set
- **THEN** Cagnard SHALL resume scanning from where the previous bounded result stopped
