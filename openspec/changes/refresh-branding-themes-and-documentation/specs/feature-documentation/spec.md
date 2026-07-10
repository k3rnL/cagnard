## MODIFIED Requirements

### Requirement: Feature documentation inventory
Cagnard SHALL maintain audience-oriented documentation for every implemented feature area so users, operators, and contributors can understand behavior without reading implementation code or navigating by internal specification names.

#### Scenario: Document implemented feature area
- **WHEN** a spec or feature area is implemented
- **THEN** Cagnard SHALL document its behavior, configuration, operational constraints, and known limitations in the appropriate getting-started, guide, operations, architecture, reference, or contributing section

#### Scenario: Navigate by reader goal
- **WHEN** a reader opens the documentation index
- **THEN** the index SHALL direct the reader by goal and audience rather than presenting a flat inventory of internal spec areas

#### Scenario: Preserve feature traceability
- **WHEN** maintainers need to confirm that an implemented spec area is documented
- **THEN** the documentation maintenance guidance SHALL map that area to its reader-facing page or section

### Requirement: Documentation update discipline
Cagnard SHALL update reader-facing documentation in the same change that adds or changes implemented behavior, while preserving the task-oriented information architecture.

#### Scenario: Feature behavior changes
- **WHEN** a change modifies implemented behavior for a spec or feature area
- **THEN** the change SHALL update each affected guide, reference, operational note, screenshot, or example before the change is archived

#### Scenario: New feature area
- **WHEN** a change introduces a new implemented feature area
- **THEN** the change SHALL add that behavior to the appropriate reader-oriented section and update documentation navigation or traceability guidance when needed

#### Scenario: Move documentation
- **WHEN** a documentation page moves during reorganization
- **THEN** repository links SHALL be updated and a compatibility pointer SHALL be retained when an established path is likely to be referenced externally

## ADDED Requirements

### Requirement: Project README experience
The root README SHALL present Cagnard as a usable product before presenting repository internals.

#### Scenario: Discover Cagnard
- **WHEN** a reader opens the repository README
- **THEN** the first section SHALL identify Cagnard, state its principal benefits, include a subtle Occitania reference, and link to release and validation status

#### Scenario: Inspect the product
- **WHEN** a reader evaluates the project from the README
- **THEN** the README SHALL show maintained Cagnard branding and at least one current screenshot captured from the real application with safe demo data

#### Scenario: Start or learn more
- **WHEN** a reader wants to run or understand Cagnard
- **THEN** the README SHALL provide concise Docker and Helm entry points and route deeper subjects to the maintained documentation

### Requirement: Task-oriented documentation structure
Cagnard SHALL organize user-facing documentation into clear sections for getting started, usage guides, operations, architecture or extension development, reference, and contributing.

#### Scenario: New user starts with Docker
- **WHEN** a user follows the Docker getting-started guide from a clean machine with Docker available
- **THEN** the guide SHALL lead to a running frontend and backend and provide the URL and demo authentication needed to enter the browser

#### Scenario: Operator starts with Helm
- **WHEN** an operator follows the Helm getting-started guide with access to a Kubernetes cluster and Helm
- **THEN** the guide SHALL install the published chart with maintained starter values and explain how to reach and authenticate to the deployment

#### Scenario: Contributor seeks internals
- **WHEN** a contributor needs implementation or extension context
- **THEN** architecture and contributing sections SHALL explain the Go backend, React frontend, provider capability model, plugin model, transfer tasks, testing, and documentation maintenance without mixing those details into the beginner path

### Requirement: Documentation visual assets
Cagnard SHALL maintain optimized, reproducible visual assets used by the README and documentation.

#### Scenario: Capture application screenshot
- **WHEN** a screenshot is added to the README or documentation
- **THEN** it SHALL use a current runnable example, contain no real credentials or private storage data, and remain legible at normal GitHub content width

#### Scenario: Use generated banner
- **WHEN** the README displays a project banner
- **THEN** the banner SHALL use the Cagnard identity without embedding essential instructions or small rasterized text in the image

#### Scenario: Validate documentation links
- **WHEN** documentation validation runs
- **THEN** it SHALL detect broken repository-local Markdown links and missing referenced visual assets
