# Configure OIDC alongside static login

Use the [local Keycloak example](../../examples/run/oidc-keycloak/README.md) for a reproducible exercise. The [full deployment configuration](../../config/cagnard.oidc.example.conf) shows a TLS deployment with separate storage policy. Field definitions are in [authentication providers](../reference/authentication.md#oidc-provider-model).

## Identity provider setup

Create a confidential OpenID Connect client with authorization code flow enabled. Register exactly `https://files.example.test/api/auth/providers/company/callback` for provider ID `company`, require PKCE S256, and obtain its client secret. Use the issuer shown in the provider's discovery document, not a guessed authorization URL. The backend must reach discovery, token, and signing-key endpoints; the browser must reach the sign-in endpoint and Cagnard callback. The [sequence diagram](../architecture/authentication.md#oidc-round-trip) shows which side makes each request.

Configure a string-array group claim in the **ID token**. Cagnard does not read UserInfo. In Keycloak, the example uses the group membership mapper with `claim.name = groups`, `full.path = true`, and `id.token.claim = true`. The example’s lower-case `engineering` group produces `/engineering`, which must match your mapping exactly.

## Cagnard setup

Keep the existing static provider as a separately granted recovery option and append this object to `auth.providers`:

```hocon
{
  id = company
  type = oidc
  label = "Company SSO"
  enabled = true
  issuer = "https://sso.example.test/realms/company"
  clientId = cagnard
  clientSecret = ${CAGNARD_OIDC_CLIENT_SECRET}
  scopes = [openid, profile]
  groupMappings = [{ claim = "/groups", value = "/engineering", group = engineering }]
}
```

Declare `engineering` and bind it to appropriate roles/roots. External groups do not create application groups or permissions. Use [direct provider/subject bindings](../reference/authorization.md#subject-model) for narrowly assigned identities.

Set `auth.publicUrl` to the exact origin opened in the browser. A reverse proxy must preserve the browser Origin header and route `/api` to the backend. Do not rewrite Origin to the internal backend address. For local development only, both the browser origin and HTTP issuer must use loopback and `allowInsecureLoopback = true`; `localhost` and `127.0.0.1` are different origins.

## Verify the deployment

Sign in with static recovery and then SSO. Compare effective permissions for equal application groups. Try an unmapped IdP user: login should succeed with no roots. Confirm denied actions keep the session, a second login attempt invalidates the older browser transaction, and an IdP outage reports an SSO failure while local login remains usable.

Cagnard sessions end at the earlier of `auth.session.ttlSeconds` and ID-token expiry. A five-minute ID token therefore yields at most a five-minute Cagnard session, even with the default one-hour setting. Configure that lifetime deliberately at the IdP; there is no refresh-token flow.

Check short-session expiry, a new login after a membership change, local logout, and cancellation of an expiring task on disposable files. Use the browser's own network/cookie tools without copying tokens into logs or support tickets.

## Personal homes for SSO users

An SSO identity gets a new derived storage key. A matching email or display name does not reuse a static user’s directory. Prepare the intended filesystem home and permissions, or deliberately assign a stable IdP subject to a known key using `storageKeys`. Test on a shared root first if home provisioning is not ready. See [storage keys](../reference/storage-access.md#storage-key-model) and [preserving an existing home](migrating-auth.md#preserve-existing-homes).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Mutation returns `invalid_origin` | Exact `publicUrl`, browser scheme/host/port, and reverse proxy Origin handling. |
| SSO unavailable before redirect | Issuer discovery reachability/TLS and client configuration; retry after the discovery backoff. |
| Callback fails | Registered callback URI, client secret, PKCE, signing algorithm, clock, nonce/state, and whether another tab replaced the transaction. |
| Login succeeds with no roots | ID-token claim path/type/value, declared group, binding scope, and enabled account. |
| Large-group users cannot sign in | Reduce selected claim data at the IdP or select a narrower claim; evidence is bounded and never silently truncated. |
| User removed from IdP group still has access | Existing group snapshot lasts until absolute expiry or fresh login. Use a local policy change/key rotation for urgent containment. |

Logout is local to Cagnard. Signing in again may reuse the IdP's session. Read the [session contract](../reference/identity-and-sessions.md) before choosing TTLs and incident procedures.
