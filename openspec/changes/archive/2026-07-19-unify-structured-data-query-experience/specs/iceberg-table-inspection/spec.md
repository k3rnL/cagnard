## ADDED Requirements

### Requirement: Lazy Iceberg table detection
Cagnard SHALL lazily inspect an authorized folder for credible Iceberg table metadata without slowing or replacing ordinary file browsing.

#### Scenario: Browse an ordinary folder
- **WHEN** a user opens a folder through the file browser
- **THEN** Cagnard SHALL show its normal directory listing as the default experience whether or not the folder could contain an Iceberg table

#### Scenario: Probe a candidate folder
- **WHEN** the current or explicitly inspected folder contains a metadata directory and credible Iceberg metadata signals
- **THEN** Cagnard SHALL report it as a candidate and validate compatibility before offering table data

#### Scenario: Listing is paginated
- **WHEN** Iceberg metadata is not present on the visible directory page
- **THEN** detection SHALL use an authorized provider-neutral probe rather than infer absence from visible rows

#### Scenario: Folder is not compatible
- **WHEN** metadata is malformed, references unsupported locations, or requires unsupported Iceberg features
- **THEN** Cagnard SHALL keep the folder browsable and report the table-opening limitation without treating normal browsing as failed

### Requirement: Explicit Iceberg table opening
Cagnard SHALL offer Iceberg inspection as a contextual alternative action and SHALL NOT make it the default folder activation.

#### Scenario: Compatible table is detected
- **WHEN** a folder is validated as a supported Iceberg table
- **THEN** Cagnard SHALL expose an accessible **Open as Iceberg table** action as the first action in that current folder's established toolbar

#### Scenario: Enter a candidate table folder
- **WHEN** a user navigates normally into a folder that is then validated as a supported Iceberg table
- **THEN** Cagnard SHALL reveal **Open as Iceberg table** without requiring the user to return to the parent and select the folder

#### Scenario: Activate folder normally
- **WHEN** a user activates the folder row or breadcrumb normally
- **THEN** Cagnard SHALL navigate the folder hierarchy rather than opening the Iceberg viewer

### Requirement: Read-only Iceberg table inspection
Cagnard SHALL inspect supported Iceberg tables through the shared structured-data runtime with Data, Schema, Metadata, Snapshots, and SQL views.

#### Scenario: Open current table state
- **WHEN** a user opens a compatible Iceberg table
- **THEN** Cagnard SHALL bind `data` to the current supported snapshot and expose exact bounded table operations

#### Scenario: Inspect snapshots
- **WHEN** the Snapshots view is active
- **THEN** Cagnard SHALL show available snapshot identifiers, parent relationships, commit times, operations, and summary metadata accurately

#### Scenario: Select a supported snapshot
- **WHEN** a user selects another supported snapshot
- **THEN** Cagnard SHALL deliberately rebind `data`, clear stale result cursors, and identify the selected snapshot in Data and SQL views

#### Scenario: Snapshot semantics are unsupported
- **WHEN** a snapshot requires delete-file, metadata-version, or table features the runtime cannot evaluate accurately
- **THEN** Cagnard SHALL mark it unsupported and SHALL NOT return rows that silently ignore those semantics

### Requirement: Authorized Iceberg object resolution
Cagnard SHALL resolve Iceberg metadata, manifests, and data files through authorized same-origin Cagnard access without exposing provider credentials or granting arbitrary external reads.

#### Scenario: Table references an authorized object
- **WHEN** a compatible metadata or data reference resolves inside the selected authorized storage root
- **THEN** Cagnard SHALL make the bounded read available to the Iceberg runtime through the scoped source adapter

#### Scenario: Table reference escapes the root
- **WHEN** metadata references an external URL, another account, or a path outside the authorized table root that is not explicitly supported
- **THEN** Cagnard SHALL reject table inspection with an actionable limitation and SHALL NOT forward credentials or fetch the reference directly

#### Scenario: Cancel Iceberg processing
- **WHEN** a user cancels table opening, snapshot loading, or a query
- **THEN** Cagnard SHALL stop the affected reads and release table-specific registrations while preserving the healthy shared runtime

### Requirement: Integrated Iceberg viewer layout
Iceberg-specific actions and snapshots SHALL integrate with existing structured viewer controls, themes, accessibility, and responsive layout.

#### Scenario: View table on a constrained screen
- **WHEN** table controls or metadata exceed the opener width
- **THEN** commands SHALL wrap or group predictably, grids SHALL own overflow, popovers SHALL remain above data surfaces, and primary navigation and cancellation SHALL remain reachable

#### Scenario: Runtime is loading
- **WHEN** Iceberg metadata or an analytical result is loading
- **THEN** Cagnard SHALL provide in-place progress with stable dimensions and SHALL NOT overlay browser navigation, side panels, or unrelated controls
