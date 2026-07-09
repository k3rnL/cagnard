## Purpose

Defines a generic, per-file change notification primitive that any opener or feature may subscribe to, independent of file type and independent of unrelated live-update mechanisms such as transfer job status.

## Requirements

### Requirement: Generic file change subscription
Cagnard SHALL provide a generic, per-file change notification stream that any opener or feature MAY subscribe to, independent of file type and independent of unrelated live-update mechanisms such as transfer job status.

#### Scenario: Subscribe to a file
- **WHEN** an opener subscribes to change notifications for a selected storage entry
- **THEN** Cagnard SHALL emit events for that entry's content and existence changes without requiring the subscriber to poll

#### Scenario: Independent of job status updates
- **WHEN** file change notifications and transfer job status updates are both active
- **THEN** Cagnard SHALL keep them as separate subscriptions with independent lifecycles and payload schemas

#### Scenario: Unsupported watch target
- **WHEN** the selected storage entry's provider does not support change notification
- **THEN** Cagnard SHALL report the subscription as unavailable rather than opening a stream that never emits events

### Requirement: File change event types
Cagnard SHALL emit distinct event types for content appended to a file, the file being replaced or reset, and the file being removed.

#### Scenario: Content appended
- **WHEN** new bytes are written to the end of a subscribed file
- **THEN** Cagnard SHALL emit an appended event including the byte offset and length of the new content

#### Scenario: File replaced or rotated
- **WHEN** a subscribed file is truncated, replaced, or otherwise loses continuity with previously observed content
- **THEN** Cagnard SHALL emit a replaced event so subscribers reset their view instead of treating it as a continuation

#### Scenario: File removed
- **WHEN** a subscribed file is deleted or becomes inaccessible
- **THEN** Cagnard SHALL emit a removed event and MAY end the subscription

### Requirement: Provider-appropriate change detection
Storage plugins SHALL report their change-notification capability status and MAY implement it through native push or backend-side polling, provided the client-visible event stream behaves identically.

#### Scenario: Native push available
- **WHEN** a storage provider supports native file change events
- **THEN** Cagnard SHALL report change notification as supported and deliver events as they occur

#### Scenario: Native push unavailable
- **WHEN** a storage provider has no native change notification mechanism
- **THEN** Cagnard MAY deliver the same event stream through backend-side polling and SHALL report the capability as degraded

### Requirement: Durable subscription connection
Cagnard SHALL keep a file change subscription connection alive across idle periods and SHALL allow the subscriber to detect and recover from a dropped connection.

#### Scenario: Idle connection kept alive
- **WHEN** no file change events occur for an extended period
- **THEN** Cagnard SHALL send periodic keepalive signals so intermediary infrastructure does not close the connection

#### Scenario: Connection dropped
- **WHEN** a file change subscription connection is interrupted
- **THEN** Cagnard SHALL allow the subscriber to reconnect and resume receiving events for the same file
