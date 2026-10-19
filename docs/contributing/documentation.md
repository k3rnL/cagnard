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

1. Add a reproducible example for the provider or relevant combination. Use source builds for unreleased configuration; never pair a new schema with an older image.
2. Add matching Helm values when the example is intended to run in Kubernetes. An IdP-only local exercise can link to the shared Cagnard deployment instructions.
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

## Diagrams and reading paths

Use a Mermaid flowchart for relationships or decisions, a sequence diagram for messages between systems, and a state diagram for lifecycle. Put each beside the explanation it supports. Keep labels short, include enough text to understand the page when diagrams are not rendered, and avoid colors as the only source of meaning. A table is usually clearer for fields, defaults, or a permission matrix.

Before adding another diagram, check the [diagram index](../README.md#diagrams) for an existing one to link. Render new diagrams, inspect their labels at a normal reading width, and review their arrows against the implementation. Label simplified diagrams as simplified rather than implying they exhaust every state.

A useful guide explains the goal, prerequisites, commands, expected result, and what to check when it fails. References define exact fields and link back to a practical guide. Keep each rule in one primary location and link to it from related pages. Preserve headings used by existing links, or update those links in the same change.

For current-checkout setup, check commands against local scripts, chart templates, and configuration defaults. For a published release, keep all versioned artifacts on the same release. Do not present a successful process health check as proof that storage or SSO is reachable.

## Compatibility Pages

The legacy `docs/features/` paths remain as concise pointers for existing external links. New content belongs in the task-oriented sections above; do not expand those compatibility pages back into a second documentation tree.
