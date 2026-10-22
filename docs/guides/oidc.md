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

## Self-signed certificates and private CAs

Cagnard verifies the identity provider's TLS certificates by default. A certificate trusted by your laptop or another application may still be unknown to the backend container. Choose one of these two methods; both apply to discovery, token exchange and signing-key downloads.

### Method 1: Install a trusted certificate

This is the recommended production setup. Obtain your organization's CA certificate in PEM format from its administrator. If the server certificate itself is self-signed, use that public certificate. No private key belongs in the Cagnard container.

Mount the certificate under `/etc/cagnard/ca/` and set the backend environment variable `SSL_CERT_DIR=/etc/ssl/certs:/etc/cagnard/ca`. The released Linux backend uses Go's system trust store: this preserves the image's existing CA bundle and adds the mounted certificates. The certificate still needs to be valid for the issuer hostname and within its validity dates. See [Go's certificate loading behavior](https://pkg.go.dev/crypto/x509#SystemCertPool).

For Helm, create a ConfigMap in Cagnard's namespace:

```bash
kubectl -n <namespace> create configmap cagnard-oidc-ca \
  --from-file=keycloak-ca.crt=./keycloak-ca.crt
```

Merge these entries into your existing values, preserving any current environment variables and storage mounts:

```yaml
backend:
  env:
    - name: SSL_CERT_DIR
      value: /etc/ssl/certs:/etc/cagnard/ca
  extraVolumes:
    - name: oidc-ca
      configMap:
        name: cagnard-oidc-ca
  extraVolumeMounts:
    - name: oidc-ca
      mountPath: /etc/cagnard/ca
      readOnly: true
```

For Compose, merge this into the backend service:

```yaml
services:
  backend:
    environment:
      SSL_CERT_DIR: /etc/ssl/certs:/etc/cagnard/ca
    volumes:
      - ./keycloak-ca.crt:/etc/cagnard/ca/keycloak-ca.crt:ro
```

Keep `trustAllCertificates` absent or `false`. Apply the configuration and recreate/restart the backend. Restart again after replacing certificates: Go caches its trust store. The files must be readable by the container's non-root user. This trust-store addition is process-wide, so other backend HTTPS clients using the system store also trust that CA. It does not install certificates in users' browsers.

### Method 2: Skip verification for one provider

Available from v0.12.1. Add the following field **inside the existing OIDC provider object** in `auth.providers`:

```hocon
trustAllCertificates = true
```

For example, the provider portion becomes:

```hocon
{
  id = keycloak
  type = oidc
  enabled = true
  label = "Keycloak"
  issuer = "https://sso.example.test/realms/company"
  clientId = cagnard
  clientSecret = ${CAGNARD_OIDC_CLIENT_SECRET}
  trustAllCertificates = true
  scopes = [openid, profile]
  groupMappings = [{ claim = "/groups", value = "/engineering", group = engineering }]
}
```

Keep your existing provider ID, credentials, mappings and grants. Restart the backend after changing the configuration. Each enabled provider with this option produces a startup warning.

This skips **both certificate-chain and hostname verification** for that provider's backend HTTPS requests. Traffic remains encrypted, but Cagnard cannot establish that the server is your identity provider; an impersonator could capture client credentials or provide false identity information. Use the trusted-certificate method when possible.

The exception does not change other OIDC providers, storage TLS settings or browser certificate checks. HTTPS is still required outside the explicit loopback mode, and issuer, signature, audience, nonce, state and PKCE checks still run. Changing this option invalidates the provider's existing Cagnard sessions and pending logins. `allowInsecureLoopback` is a separate local HTTP option, not a certificate-verification switch. See the [provider reference](../reference/authentication.md#oidc-provider-model) and [session invalidation rules](../reference/identity-and-sessions.md#freshness-and-invalidation).

## Verify the deployment

Sign in with static recovery and then SSO. Compare effective permissions for equal application groups. Try an unmapped IdP user: login should succeed with no roots. Confirm denied actions keep the session, a second login attempt invalidates the older browser transaction, and an IdP outage reports an SSO failure while local login remains usable.

Cagnard sessions end at the earlier of `auth.session.ttlSeconds` and ID-token expiry. A five-minute ID token therefore yields at most a five-minute Cagnard session, even with the default one-hour setting. Configure that lifetime deliberately at the IdP; there is no refresh-token flow.

Check short-session expiry, a new login after a membership change, local logout, and cancellation of an expiring task on disposable files. Use the browser's own network/cookie tools without copying tokens into logs or support tickets.

## Personal homes for SSO users

An SSO identity gets a new derived storage key. A matching email or display name does not reuse a static user’s directory. Prepare the intended filesystem home and permissions, or deliberately assign a stable IdP subject to a known key using `storageKeys`. Test on a shared root first if home provisioning is not ready. See [storage keys](../reference/storage-access.md#storage-key-model) and [preserving an existing home](migrating-auth.md#preserve-existing-homes).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Clicking SSO opens `/api/auth/providers/<id>/start` as a page and returns `invalid_session` | An older frontend may still be served. Deploy matching frontend/backend images and reload the browser; current SSO starts with a POST. Check Helm image overrides and any proxy cache. |
| Mutation returns `invalid_origin` | Exact `publicUrl`, browser scheme/host/port, and reverse proxy Origin handling. |
| SSO unavailable before redirect | Read `outcome=start_failed` in backend logs; check issuer discovery, TLS and the exact advertised issuer. For private certificates, use one of the [two methods above](#self-signed-certificates-and-private-cas). |
| Callback fails | Registered callback URI, client secret, PKCE, signing algorithm, clock, nonce/state, and whether another tab replaced the transaction. |
| Login succeeds with no roots | ID-token claim path/type/value, declared group, binding scope, and enabled account. |
| Large-group users cannot sign in | Reduce selected claim data at the IdP or select a narrower claim; evidence is bounded and never silently truncated. |
| User removed from IdP group still has access | Existing group snapshot lasts until absolute expiry or fresh login. Use a local policy change/key rotation for urgent containment. |

### Read the backend diagnostics

From v0.12.1, failed logins include a stage and reason, for example:

```text
WARN authentication provider=keycloak outcome=start_failed failure.stage=discovery failure.reason=tls_unknown_authority
WARN authentication provider=keycloak outcome=start_failed failure.stage=discovery failure.reason=tls_unknown_authority failure.backoff=true failure.retry_after_seconds=30
WARN authentication provider=keycloak outcome=callback_failed failure.stage=token_exchange failure.reason=invalid_client failure.http_status=401
```

| Stage / reason | What to check |
| --- | --- |
| `discovery` / `tls_unknown_authority` | Install the CA in the backend, or explicitly select the provider TLS exception. |
| `tls_hostname_mismatch`, `tls_certificate_invalid`, `tls_verification_failed` | Certificate hostname, validity dates and chain. |
| `dns_failed`, `connection_failed`, `timeout`, `request_canceled` | Backend DNS, routing, proxy, firewall and provider availability. Each outbound request has an eight-second timeout. |
| `discovery` / `http_error` | The logged `http_status`; the discovery endpoint must return HTTP 200 and JSON. |
| `discovery` / `invalid_discovery_document`, `issuer_mismatch`, `invalid_authorization_endpoint` | Fetch `<issuer>/.well-known/openid-configuration` from the backend network. Its `issuer` must exactly match configuration, and its authorization endpoint must be a valid HTTPS URL. An admin hostname may differ from the realm's advertised issuer. |
| `https_required` | A configured or discovered endpoint uses HTTP outside explicit loopback development. |
| `transaction` / `cookie_missing`, `cookie_invalid_or_expired` | Browser cookie delivery, public origin, Secure cookies, shared session key and five-minute transaction expiry. Start a fresh login. |
| `transaction` / `state_mismatch`, `provider_or_configuration_changed`, `expired` | A second tab may have replaced the transaction, configuration may have changed, or the login took too long. |
| `callback` / `access_denied`, `login_required`, `provider_returned_error` | User consent and provider login policy; inspect Keycloak's own logs for further detail. |
| `token_exchange` / `invalid_client`, `invalid_grant` | Client ID/secret, client authentication mode, registered callback, PKCE and expired/already-used authorization codes. |
| `token_exchange` / `token_endpoint_error`, `id_token_missing_or_too_large` | Token endpoint status and whether the client receives a valid ID token. |
| `jwks` / `key_fetch_failed` | Signing-key endpoint reachability and response. Nearby `oidc_http` logs identify TLS/network failures or HTTP status. |
| `id_token` / `signature_invalid`, `malformed_token_or_unsupported_algorithm` | Signing keys, token format and supported algorithms (RS256, ES256, PS256). |
| `id_token` / `issuer_mismatch`, `audience_mismatch`, `authorized_party_mismatch`, `nonce_mismatch`, `subject_invalid` | Provider/client configuration and the token's required identity claims. |
| `id_token` / `token_expired`, `token_not_yet_valid` | Backend/IdP clock synchronization and token lifetime. |
| `claims` / `invalid_claims`, `mapped_claim_invalid_or_too_large`, `display_name_too_large` | ID-token claim types and the [documented claim bounds](../reference/authentication.md#external-group-mapping-model). |
| `session` / `identity_rejected`, `cookie_encode_failed` | Enabled provider, session lifetime/key and the [session cookie size limit](../reference/identity-and-sessions.md#session-model). |
| `request_failed` | An unclassified failure; correlate the stage and nearby `oidc_http` records with provider logs. |

Discovery failures are cached for 30 seconds; repeated clicks retain the original reason and add `backoff=true`. Retry once that interval has passed, or restart after correcting configuration. Browser messages remain generic. Logs omit passwords, client secrets, tokens, cookies, authorization codes, state/nonce values and raw upstream response bodies. Share the stage, reason and status when reporting an issue.

Logout is local to Cagnard. Signing in again may reuse the IdP's session. Read the [session contract](../reference/identity-and-sessions.md) before choosing TTLs and incident procedures.
