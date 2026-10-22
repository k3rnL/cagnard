# Contributing to Cagnard

Thanks for helping improve Cagnard. Contributions to code, documentation, runnable examples, tests, and issue triage are welcome.

Unless explicitly stated otherwise, contributions submitted to this repository are licensed under the [GNU Affero General Public License v3.0 or later](LICENSE), the same license as the project.

## Before You Start

- Search existing issues and pull requests before opening a new one.
- Use a public issue for reproducible bugs and focused feature proposals.
- Do not disclose suspected vulnerabilities publicly. Follow the [security policy](SECURITY.md).
- Keep changes focused. Large behavioral changes should explain the user problem, intended behavior, deployment impact, and compatibility considerations before implementation begins.

## Development

Follow the [development setup](docs/getting-started/development.md) for prerequisites and local commands. The repository contains a Go backend, a React frontend, Docker Compose examples, a Helm chart, and a WebAssembly browser demo.

Useful guides include:

- [Testing and validation](docs/contributing/testing.md)
- [Adding a first-party file opener](docs/contributing/file-openers.md)
- [Documentation maintenance](docs/contributing/documentation.md)
- [Architecture overview](docs/architecture/overview.md)

## Pull Requests

Before requesting review:

1. Explain the user-visible problem and the chosen behavior.
2. Add or update tests for changed behavior.
3. Update user, operator, architecture, and configuration documentation when applicable.
4. Run the checks relevant to the change. Run the full suite with `pnpm check` when practical.
5. Keep generated files and release-specific examples consistent with their source configuration.
6. Avoid unrelated formatting or refactoring in the same pull request.

The validation workflow runs backend tests, frontend tests and type checking, production builds, deployment-example validation, the WebAssembly demo check, and documentation-link checks.

## Storage and Security Boundaries

Cagnard mediates access to filesystems and object storage. Changes involving authentication, authorization, provider credentials, paths, archives, structured data, uploads, downloads, or cross-provider transfers should include negative tests for boundary violations and document any operational tradeoffs.

Never commit credentials, session material, private keys, production configuration, or data copied from a real storage account.
