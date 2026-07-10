# Documentation Maintenance

Reader documentation and OpenSpec serve different purposes:

- `openspec/specs/` defines maintained behavioral requirements and scenarios.
- `docs/` helps users install, use, operate, understand, and extend the implemented product.
- runnable examples are executable documentation and must stay synchronized with both.

## Where A Change Belongs

| Change | Reader documentation |
| --- | --- |
| First-run command or prerequisite | `docs/getting-started/` and example README |
| User workflow or limitation | `docs/guides/` |
| Deployment, secret, health, or upgrade behavior | `docs/operations/` |
| Provider/plugin/runtime design | `docs/architecture/` |
| Exact fields or capability matrix | `docs/reference/` |
| Validation or maintenance workflow | `docs/contributing/` |

Do not recreate a flat page for every engineering spec. Update the smallest set of goal-oriented pages that a reader would actually consult.

## Required Updates

When adding a provider or authentication method:

1. Add a release-first Docker Compose example or relevant provider combination.
2. Add matching pure Helm values.
3. Document demo credentials, ports, cleanup, and production caveats.
4. Update configuration and capability references.
5. Add scoped tests and validation coverage.

When changing a file opener, transfer behavior, appearance, or browser action, update its guide and any architecture/reference page that defines the contract.

## Links And Images

Use repository-relative Markdown links. Give every image useful alternative text and keep source brand art separate from optimized web derivatives. Screenshots must use generated/demo data, avoid credentials, and be recaptured when the UI contract materially changes.

Run:

```bash
pnpm docs:check
```

Then inspect rendered Markdown because link validation cannot catch unclear structure, stale prose, unreadable screenshots, or unsupported badges.

## Compatibility Pages

The legacy `docs/features/` paths remain as concise pointers for existing external links. New content belongs in the task-oriented sections above; do not expand those compatibility pages back into a second documentation tree.
