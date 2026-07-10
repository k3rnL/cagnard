# Security

Cagnard centralizes access to multiple storage systems. Its security boundary includes the backend process, its HOCON configuration, provider credentials, the browser session, mounted filesystem paths, and network access to provider endpoints.

## Authentication

Static authentication validates configured password verifier material and issues an HMAC-signed, HTTP-only, SameSite=Lax cookie. The backend re-resolves the configured user on every request; there is no server-side session database.

For an internet-facing deployment:

- use a high-entropy `auth.session.signingSecret` supplied through secret infrastructure;
- set `auth.session.secureCookies = true` and serve only through HTTPS;
- use an appropriate session TTL and rotate the signing secret when compromise is suspected;
- remove development mode and all demo credentials;
- keep static password verifiers out of public configuration.

OIDC provider declarations reserve the future external identity contract. End-to-end OIDC/SSO login is not yet a supported production authentication mode.

## Authorization

Root access is evaluated from the current principal and `allowedUsers`, `allowedRoles`, and `allowedGroups`. Personal and global roots are separate namespaces. Account `readOnly = true` is enforced before mutation reaches the provider.

Provider credentials authorize the backend, not the end user. Scope each account to the smallest bucket, prefix, filesystem path, and API policy that its roots require. Cagnard authorization must complement, not replace, provider-side least privilege.

## Filesystem Isolation

Filesystem roots are normalized and operations are constrained below the configured base path. Still, deploy the backend under a dedicated OS identity and mount only intended paths. Do not give the container a host root mount, Docker socket, or unrelated secret directories.

## S3 Credentials And TLS

Prefer workload/default-chain credentials when the environment supports them. For static keys, inject environment substitutions or mounted secrets and rotate them outside Cagnard. Keep TLS enabled. `trustAllCertificates` exists for controlled local compatibility testing and should not be used in production.

Path-style addressing and custom endpoints change routing, not the trust model. Verify endpoint DNS, certificate names, bucket policy, encryption, versioning, and deletion protections.

## Browser And Plugins

UI opener manifests expose rendering choices and scoped Cagnard file APIs; they never expose provider credentials. Cagnard does not currently load arbitrary third-party executable bundles from configuration. Treat any future executable UI or provider plugin as trusted code requiring review and isolation.

The pasteboard stores entry references only in browser memory and synchronizes them between active same-origin tabs. It does not persist across a complete browser restart. Paths copied to the system clipboard leave the application security boundary.

## Logs And Errors

User responses should contain actionable but non-sensitive messages. Administrative causes belong in backend logs. Do not log HOCON contents, session cookies, authorization headers, access keys, or uploaded file content. Provider errors can contain endpoint and object names; configure log access accordingly.

## Incident Actions

1. Revoke or rotate affected provider credentials.
2. Rotate the Cagnard session signing secret to invalidate sessions.
3. Inspect provider audit logs and Cagnard backend logs.
4. Restore or version-recover provider data when supported.
5. Correct root authorization or account scope before restoring service.
