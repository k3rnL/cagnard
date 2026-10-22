# Identities and sessions

A [login provider](authentication.md) establishes identity. A session carries bounded evidence of that login. [Bindings](authorization.md) evaluate the current principal, and the [storage key](storage-access.md#storage-key-model) locates its home. These are separate models with different change semantics.

## Principal model

| Field | Meaning |
| --- | --- |
| `providerId` | Stable configured login provider ID. |
| `issuer` | Verified issuer for OIDC; empty for static/development. Backend identity input. |
| `subject` | Static user ID or verified OIDC `sub`. Never an email fallback. |
| `id` | Opaque hash of a versioned structured tuple `(providerId, issuer, subject)`, used for task ownership and browser synchronization. |
| `displayName` | Presentation only; bounded and not used in access checks. |
| `groups` | Current static memberships or mapped OIDC evidence. These are application group IDs. |
| `storageKey` | Backend-only safe segment, separately assigned or derived. |
| `expiresAt` | Absolute backend authentication deadline. |

Only public profile fields (`id`, `providerId`, `subject`, `displayName`, `groups`) appear in `/api/session`. There are no global profile roles. Permissions are returned per root as `actions` in navigation/listing responses.

`local/alice` and `company/alice` are separate identities in Cagnard, even if their display names or emails match. Changing issuer or provider ID also creates a new identity. The tuple is structured before hashing, so delimiters inside identifiers cannot alias another identity. Task ownership follows this canonical ID; an equal subject from another provider receives a 404 for the task.

## Session model

| Field | Meaning |
| --- | --- |
| `auth.session.key` | Required standard-base64 encoding of 32 random bytes. Generate with `openssl rand -base64 32`; inject through a required secret substitution. |
| `ttlSeconds` | Absolute lifetime, default 3,600 seconds; valid range 1–86,400. An OIDC session also ends no later than its ID token expiry. |
| `secureCookies` | Defaults to `true`. Disabling it requires explicit loopback configuration. |

Production cookies use `__Host-Cagnard-Session-v2`, Path `/`, HttpOnly, Secure, and SameSite=Lax. Local HTTP uses `Cagnard-Session-v2`. Names are fixed. Authentication and AES encryption use the pinned `gorilla/securecookie` implementation and independently derived purpose keys. Session, OIDC-transaction, identity-revision, and pagination keys are distinct. Legacy cookies are not accepted.

The encoded cookie is limited to 3,500 bytes. Its version, issue/expiry times, provider, subject, and configuration revision are checked. Static evidence includes a protected password-verifier revision; every request looks up the enabled current user and groups. OIDC evidence retains only display name and configured mapping claims, never an access token, refresh token, or complete ID token.

## Freshness and invalidation

Configuration is read at startup, not hot-reloaded. After restarting with changed policy, existing valid sessions use the new bindings and group mappings. Removed/disabled static users, changed static verifiers, and disabled/removed providers invalidate sessions. Changing OIDC issuer, client ID, requested scopes, selected claim paths, or `trustAllCertificates` requires fresh sign-in.

OIDC membership is a snapshot. A membership removal at the IdP does not immediately revoke a Cagnard cookie; the change becomes visible at the next login, bounded by absolute expiry. There is no silent refresh or sliding session extension. Changing local mapping values can reinterpret an existing selected claim snapshot; adding a new claim path invalidates that evidence.

Rotating the shared session key invalidates all cookies and pagination references. Replicas serving the same deployment need matching configuration and key material. Tasks remain process-local; see [task durability](../architecture/tasks.md#configuration-and-durability).

### When a change takes effect

| Change | Effect |
| --- | --- |
| Role actions, bindings, or static group membership | After backend restart; a still-valid cookie uses the new policy. |
| OIDC group membership at the IdP | Next successful OIDC login; the current snapshot lasts until its absolute expiry. |
| Change a static password verifier or disable a user/provider | After restart; affected existing sessions are rejected. |
| OIDC issuer, client ID, scopes, selected claim paths, or `trustAllCertificates` | After restart; affected users must sign in again. |
| Shared session key | After restart on every replica; all sessions are invalidated. |
| Local logout | This browser loses its Cagnard session; the IdP session and already accepted server tasks are not revoked. |

For urgent access removal, use the [security incident actions](../operations/security.md#incident-actions); changing membership at the IdP alone does not invalidate the existing snapshot.

## Login transaction model

One protected `OIDC-v2` cookie holds a provider/configuration binding, random state, nonce, PKCE verifier, approved local return path, and a five-minute deadline. A later attempt supersedes the earlier transaction in that browser. Callback handling clears it on success and failure. Codes and tokens are exchanged only in the backend.

Deleting a cookie is not server-side revocation. Authorization-code single use is enforced by the IdP; state and PKCE bind the exchange to the initiating browser transaction. See [OIDC setup](../guides/oidc.md).

## Logout and execution context

Logout clears this browser's Cagnard cookies. It does not sign out of the IdP, revoke copied cookies, or cancel already accepted server tasks. The frontend clears private views, selection, pasteboard, task state, uploads, and analytical workers. A 401 performs the same private-state cleanup; a 403 keeps the login.

Jobs receive verified evidence, not raw request headers, cookies, or provider tokens. Their execution context ends no later than the initiating session. New operations recheck identity and root actions; stream/watch contexts are canceled at expiry. Provider work already committed cannot be rolled back, and cancellation is cooperative.

A blocked conflict can be explicitly resolved with a fresh login and current permissions. A transfer that already changed storage must be submitted as a new request for its remaining items; completed destructive steps are never automatically replayed. Downloads and partially executed/canceled jobs require a new task. See [task authorization and continuation](../architecture/tasks.md#authentication-and-continuation).
