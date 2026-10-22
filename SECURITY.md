# Security Policy

## Supported Versions

Security fixes target the latest published Cagnard release. Users should upgrade the backend, frontend, configuration, and Helm chart together and keep all deployment artifacts on the same release version.

Older releases may not receive fixes. A security advisory will identify affected versions, fixed versions, and any required configuration or credential changes.

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability.

[Open a private vulnerability report](https://github.com/k3rnL/cagnard/security/advisories/new) through GitHub Security Advisories. Include:

- the affected version or commit;
- the deployment model and storage provider involved;
- clear reproduction steps or a minimal proof of concept;
- the expected and observed security boundary;
- the potential impact; and
- any suggested mitigation, if known.

Do not include real credentials, tokens, private keys, or sensitive user data. Use disposable test accounts and storage when demonstrating the issue.

You should receive an acknowledgement within seven days. Please allow time to reproduce, fix, test, and coordinate disclosure before publishing details.

## Security Documentation

Operators should review [deployment security](docs/operations/security.md), [authentication](docs/reference/authentication.md), [authorization](docs/reference/authorization.md), and [storage access](docs/reference/storage-access.md).
