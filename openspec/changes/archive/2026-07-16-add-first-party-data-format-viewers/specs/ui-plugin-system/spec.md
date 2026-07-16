## REMOVED Requirements

### Requirement: Frontend plugin extension points
**Reason**: Backend-supplied manifests cannot provide executable frontend behavior and therefore do not constitute a meaningful extension system.
**Migration**: Remove `uiPlugins` configuration and implement supported views as typed, lazy-loaded first-party openers.

### Requirement: File opener plugins
**Reason**: All real opener implementations already ship in the frontend, while manifests only route files to a fixed hard-coded view.
**Migration**: Register maintained file openers in the compile-time first-party opener registry.

### Requirement: Text opener rendering
**Reason**: Text rendering is maintained first-party behavior and no longer depends on a registered opener plugin.
**Migration**: Use the built-in text-capable opener selected by the first-party registry.

### Requirement: File manipulation plugins
**Reason**: The current system has no executable or isolated third-party action implementation, so retaining declarative manipulation actions would expose a non-functional contract.
**Migration**: Add authorized file manipulation behavior directly as a first-party browser action when required.

### Requirement: UI plugin capability declaration
**Reason**: Capability declarations for non-executable UI manifests add configuration complexity without enabling independent implementations.
**Migration**: First-party opener descriptors declare content, size, mode, and storage capability requirements in typed frontend code.

### Requirement: UI plugin isolation
**Reason**: There are no executable third-party UI plugins to isolate in the current product.
**Migration**: First-party openers continue to use core-mediated content URLs and SHALL NOT receive raw provider credentials.

### Requirement: Provider and storage plugin coordination
**Reason**: Frontend manifests do not implement provider behavior; first-party openers can coordinate directly through normalized metadata and storage capabilities.
**Migration**: Use the first-party opener contract and provider-neutral content APIs. Storage provider plugins remain supported.

### Requirement: Plugin ordering and fallback
**Reason**: Operator-configured plugin ordering is unnecessary after removing server-supplied UI manifests.
**Migration**: Use deterministic compile-time opener priorities and first-party fallback behavior.
