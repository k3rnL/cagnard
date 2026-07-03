# Cross-Provider Transfer

## Behavior

Cagnard's storage model is designed so files and objects can be transferred between provider implementations through normalized operations and capabilities.

Planned transfer behavior includes:

- provider-agnostic copy and move planning
- capability negotiation
- metadata preservation policy
- conflict handling
- progress and recovery reporting
- auditability

## Configuration

Transfers will depend on configured providers, accounts, roots, account permissions, and provider capabilities.

## Operational Notes

- Same-root copy and move exist for the current filesystem provider.
- True cross-provider transfer orchestration is future work.

## Known Limitations

- No transfer planner or transfer job API exists yet.
- No resumable transfer or progress model is implemented yet.
- Provider-specific metadata preservation rules are not implemented.
