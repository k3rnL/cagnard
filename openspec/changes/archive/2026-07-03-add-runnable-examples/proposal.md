## Why

Cagnard now has enough auth and storage combinations that a new user should not need to assemble configuration, containers, and Helm values by hand before trying the product. Runnable examples will make the project easier to evaluate and will create a standing rule that every new provider or auth method ships with matching starter deployment assets.

## What Changes

- Add a structured examples catalog that progresses from the simplest local setup to richer combinations.
- Add docker-compose examples for local filesystem, static users, S3-compatible storage, and static users plus S3/MinIO.
- Add pure Helm values matching those combinations so Kubernetes users can start from scratch.
- Include MinIO in the S3 examples so users can run a complete S3-compatible demo locally without external cloud accounts.
- Document which examples are minimal, which are combined provider/auth demos, and which are intended as production-adjacent starting points.
- Establish the rule that future provider or auth-method changes must add or update associated docker-compose and Helm values examples.
- Keep examples secret-safe by using demo credentials only for local services and explicit placeholders or environment substitutions for real provider credentials.

## Capabilities

### New Capabilities

- `runnable-example-catalog`: Defines the example catalog structure, required local/Kubernetes artifacts, provider/auth combination coverage, MinIO-backed S3 demo behavior, and maintenance rules for future providers and auth methods.

### Modified Capabilities

- `deployment-packaging`: Extend deployment packaging requirements so docker-compose examples and Helm values are first-class example artifacts, not only ad hoc documentation snippets.

## Impact

- Repository examples: new or reorganized runnable example directories for simple local, static-users, S3/MinIO, and static-users-plus-S3 combinations.
- Deployment assets: docker-compose files, environment examples, seed data, MinIO initialization where needed, and pure Helm values files.
- Documentation: README/docs updates describing the example matrix, startup commands, demo credentials, ports, cleanup, and security boundaries.
- Validation: lightweight checks that example config files render/load and that compose/Helm example files remain structurally valid.
- Future development process: provider and auth changes must include matching runnable examples when the new capability affects how users start Cagnard.
