## MODIFIED Requirements

### Requirement: Feature documentation
Cagnard SHALL update feature documentation to describe the Go backend runtime while preserving behavior-level documentation.

#### Scenario: Update backend language references
- **WHEN** documentation describes backend implementation, local development, testing, images, or release artifacts
- **THEN** it SHALL refer to the Go backend where it is the production runtime

#### Scenario: Preserve behavior documentation
- **WHEN** documentation describes storage browsing, authentication, providers, transfer jobs, examples, or deployment behavior
- **THEN** it SHALL preserve behavior-level descriptions unless the Go rewrite intentionally changes that behavior

### Requirement: Migration documentation
Cagnard SHALL document the backend rewrite for maintainers and operators.

#### Scenario: Read migration notes
- **WHEN** a maintainer reads the rewrite documentation
- **THEN** it SHALL explain what moved from Scala to Go, which commands changed, how compatibility was validated, and what Scala artifacts remain temporarily or were removed

#### Scenario: Read release notes
- **WHEN** operators read the release notes for the Go rewrite release
- **THEN** the notes SHALL identify the backend runtime change and call out any required deployment or image changes
