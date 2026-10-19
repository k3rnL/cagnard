# Authentication providers

Authentication answers **who signed in**. It produces a [principal and session](identity-and-sessions.md); [authorization bindings](authorization.md) decide what that principal can do. Storage credentials belong to [accounts](storage-access.md), independently of login providers.

Start with the complete [static and OIDC configuration](../../config/cagnard.oidc.example.conf), the runnable [Keycloak exercise](../../examples/run/oidc-keycloak/README.md), or the [migration guide](../guides/migrating-auth.md).

## Application authentication model

| Field | Meaning and validation |
| --- | --- |
| `auth.version` | Required integer `2`. There is no implicit authentication mode. |
| `auth.publicUrl` | Required absolute browser origin, such as `https://files.example.test`. No path, credentials, query, or fragment. Used for callbacks and mutation-origin checks; forwarded headers cannot override it. |
| `auth.allowInsecureLoopback` | Defaults to `false`. Allows HTTP only for literal loopback IPs or `localhost`, for local exercises. |
| `auth.session` | Shared [session protection and lifetime](identity-and-sessions.md#session-model). |
| `auth.providers[]` | Independent static or OIDC providers; at least one must be enabled. |
| `auth.development` | Optional explicit test identity source; mutually exclusive with login providers. |

Authentication and policy objects reject unknown fields. Boolean `enabled` fields must be explicitly `true` to enable providers and users. Provider IDs must be unique and stable, use 1–64 ASCII letters, digits, underscores or hyphens, and start with a letter or digit; `development` is reserved. A provider label is only presentation. Changing a provider ID creates different identities and homes.

## Static provider and user models

This object belongs inside `auth.providers`. Declare the referenced group and its bindings under `authorization`; this fragment alone is not a complete configuration.

```hocon
{
  id = local
  type = static
  label = "Local account"
  enabled = true
  users = [{
    id = alice
    displayName = "Alice Example"
    enabled = true
    groups = [engineering]
    storageKey = alice
    credential.verifier = ${CAGNARD_ALICE_PASSWORD_VERIFIER}
  }]
}
```

| Field | Meaning |
| --- | --- |
| `users[].id` | Login name and immutable subject within this provider; unique and non-empty. |
| `displayName` | Optional display text; falls back to subject. Never an authorization or storage key. |
| `enabled` | Disabled users cannot log in, and existing sessions stop working. |
| `groups[]` | References to declared application [groups](authorization.md#group-model). Unknown groups fail startup. |
| `storageKey` | Optional safe home segment. Preserve an existing home with an explicit value; see [storage targeting](storage-access.md#storage-key-model). |
| `credential.verifier` | Required for enabled users. `pbkdf2-sha256:iterations:base64url-salt:base64url-hash`; 10,000–2,000,000 iterations, salt at least 16 bytes, 32-byte SHA-256 output. Existing shipped 120,000-iteration verifiers remain compatible. |

Users have no `roles` or arbitrary `claims` fields. Groups and direct identity references receive scoped roles through bindings. Renaming a user creates a new subject; it is not a display-name edit. Password changes invalidate sessions through a protected credential revision. The server never stores a plaintext password.

The public demo password is `cagnard`. Production verifiers and session keys must come from your secret-management process, not the example values.

### Create a password verifier

Use this Python 3 example in an interactive terminal. It asks for the password without placing it in shell history and prints only the verifier to store as `credential.verifier` or in a secret. The example uses 600,000 iterations; choose an accepted cost that fits your deployment’s login latency.

```bash
python3 - <<'PYTHON'
import base64
import getpass
import hashlib
import secrets

password = getpass.getpass("New Cagnard password: ")
if not password or password != getpass.getpass("Repeat password: "):
    raise SystemExit("Passwords must be non-empty and match")
iterations = 600_000
salt = secrets.token_bytes(16)
digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, dklen=32)
encode = lambda value: base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")
print(f"pbkdf2-sha256:{iterations}:{encode(salt)}:{encode(digest)}")
PYTHON
```

Treat the result as sensitive configuration. Restart after updating it; the old user sessions become invalid. Generate the separate session protection key as described in [session configuration](identity-and-sessions.md#session-model).

## OIDC provider model

| Field | Meaning |
| --- | --- |
| `type` | `oidc` |
| `issuer` | Exact trusted issuer URL. HTTPS except the explicit loopback exception. |
| `clientId`, `clientSecret` | Confidential backend client credentials. Use required environment substitution for the secret. |
| `scopes[]` | Requested scopes; `openid` is always included. Request only needed claims. No refresh flow. |
| `groupMappings[]` | Provider-scoped mapping objects, described below. |
| `storageKeys[]` | Optional `{ subject, storageKey }` assignments for deliberately reassigning existing homes. No automatic email linking. |

Register exactly `<publicUrl>/api/auth/providers/<id>/callback` with the identity provider. Enable authorization code flow with PKCE S256 and client authentication. Configure mapped claims in the **ID token**. Cagnard does not call UserInfo, so UserInfo-only groups will not grant access.

The backend validates signature, allowed algorithm (RS256, ES256, PS256), issuer, audience, authorized party, expiry, nonce, and subject. Discovery, exchange, and key retrieval have bounded responses and network timeouts. A temporary SSO failure leaves static login usable; it never changes the authenticated identity automatically. See the [flow and package boundaries](../architecture/authentication.md).

## External group mapping model

```hocon
groupMappings = [
  { claim = "/groups", value = "/engineering", group = engineering },
  { claim = "/realm_access/roles", value = "file-auditor", group = auditors }
]
```

`claim` is a JSON Pointer; `~1` represents `/` in a property name and `~0` represents `~`. Array positions use zero-based indices without leading zeroes. `value` is an exact, case-sensitive external string. `group` references a declared application group. External roles have no special meaning; they must pass through an explicit mapping just like group names.

A selected claim must be a string or an array containing only strings. Missing claims and unknown values grant nothing; invalid types reject login. Each selected array is limited to 64 strings of at most 256 bytes. The encrypted cookie must also fit its [size bound](identity-and-sessions.md#session-model). Oversized evidence fails login instead of dropping membership silently.

## Development identity model

```hocon
auth {
  version = 2
  publicUrl = "http://localhost:5173"
  allowInsecureLoopback = true
  session { key = ${CAGNARD_SESSION_KEY}, secureCookies = false }
  development {
    enabled = true
    defaultUser = alice
    users = [{ id = alice, enabled = true, groups = [engineering], storageKey = alice }]
  }
}
```

The example replaces `auth.providers`; remove that array and declare `engineering` and its bindings separately. Set `server.host = "127.0.0.1"` when adapting a container configuration.

Development users have the same identity and policy checks, but no password. `X-Cagnard-User` selects a configured enabled user; otherwise `defaultUser` applies. Bearer tokens are rejected even in development. The server must bind to loopback; configuration validation rejects other listeners. Do not expose this configuration through a public proxy. This mode is for controlled local work; use static login for ordinary deployments.
