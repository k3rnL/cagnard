## 1. Backend

- [x] 1.1 Add validated provider-scoped TLS policy, isolated clients, startup warning and revision handling.
- [x] 1.2 Add safe diagnostics across discovery, transactions, token verification and session issuance, preserving discovery failure reasons during backoff.
- [x] 1.3 Add regression coverage for strict/custom-CA/bypass TLS, provider isolation, token checks and log redaction.

## 2. Operator documentation

- [x] 2.1 Document both self-signed certificate paths with Helm/Compose examples, scope, restart instructions, diagnostic reasons and cross-links.
- [x] 2.2 Prepare v0.12.1 release notes and align chart, frontend and deployment image versions.

## 3. Release

- [x] 3.1 Run backend, frontend, packaging, documentation and spec checks; review the final diff.
- [x] 3.2 Sync and archive the completed implementation specs for the patch release. Publication and artifact verification follow the implementation checklist.
