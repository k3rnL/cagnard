# Testing And Validation

Changes should be validated at the narrowest useful level while being covered by the repository-wide checks before release.

## Core Commands

```bash
pnpm backend:test
pnpm --filter @cagnard/frontend test
pnpm --filter @cagnard/frontend typecheck
pnpm --filter @cagnard/frontend build
pnpm examples:check
pnpm docs:check
```

Run the combined check with:

```bash
pnpm check
```

## Backend

Go unit and API tests live under `backend-go`. Provider-independent tests must run without Docker. Integration tests that require MinIO belong to the S3 plugin/provider scope and should run in a separate Docker-backed CI job.

## Frontend

Vitest covers focused state and contract behavior. TypeScript typecheck and the production Vite build catch integration and bundling failures. User-facing workflow changes also require browser verification at desktop and constrained widths.

For appearance changes, verify Classic light/dark and Solar light/dark, system-mode changes, reload persistence, operator lock, keyboard focus, status contrast, menus, dialogs, toasts, file openers, and responsive navigation.

## Examples And Packaging

`scripts/validate-compose-examples.sh` renders every release-first Compose file and its source-build override. `scripts/validate-helm-examples.sh` lints/templates the chart with maintained values. Run actual smoke tests when changing container startup, proxying, providers, seeded data, or credentials.

Mocker is for local macOS image validation only. CI, release publishing, and runnable Compose examples use Docker.

## Documentation

`pnpm docs:check` validates local Markdown links and referenced assets. Also inspect README and documentation images at normal and narrow widths and verify that screenshots contain no credentials or private content.

## OpenSpec

Behavior changes use the OpenSpec artifact workflow. Before archiving a change, run strict validation for its change ID and ensure implementation decisions are reflected in its design/specs and in reader-facing documentation.
