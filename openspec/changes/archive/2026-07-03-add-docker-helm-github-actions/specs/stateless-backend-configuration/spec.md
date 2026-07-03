## ADDED Requirements

### Requirement: Container supplied configuration
Cagnard SHALL support containerized deployments where backend configuration is supplied at runtime through mounted HOCON files and externalized secret sources.

#### Scenario: Load mounted container configuration
- **WHEN** the backend container starts with `CAGNARD_CONFIG` pointing to a mounted HOCON file
- **THEN** Cagnard SHALL load server, auth, users, providers, accounts, storage roots, and UI plugin declarations from that file without requiring image rebuilds

#### Scenario: Use Kubernetes secret references
- **WHEN** deployment configuration references environment variables or mounted files populated from Kubernetes Secrets
- **THEN** Cagnard SHALL resolve those values at startup without writing secret material into backend-local persistent state

### Requirement: Helm configuration source
Cagnard SHALL let Helm deployments choose how backend HOCON configuration is provided without forcing secrets into chart source.

#### Scenario: Render inline non-secret config
- **WHEN** Helm values provide non-secret HOCON configuration for local or demo deployment
- **THEN** the chart SHALL render a ConfigMap and mount it for the backend container

#### Scenario: Use existing config secret
- **WHEN** Helm values reference an existing Kubernetes Secret or volume containing the HOCON configuration
- **THEN** the chart SHALL mount that external source instead of rendering sensitive configuration into a ConfigMap
