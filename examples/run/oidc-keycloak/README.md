# Local static + Keycloak login

This exercise runs Keycloak in Docker and the current Cagnard checkout on the host. Both browser and backend reach the **same loopback issuer**, avoiding container/host issuer mismatches. It is disposable and contains public demo secrets.

The pinned container uses Keycloak's documented [realm import on startup](https://www.keycloak.org/server/containers#importing-a-realm-on-startup). See [OIDC setup](../../../docs/guides/oidc.md), [authentication models](../../../docs/reference/authentication.md), and [authorization](../../../docs/reference/authorization.md).

## Start

From the repository root:

```bash
docker compose --env-file examples/run/oidc-keycloak/.env.example \
  -f examples/run/oidc-keycloak/docker-compose.yaml up -d
```

Wait until [issuer discovery](http://localhost:8081/realms/cagnard/.well-known/openid-configuration) responds. In another terminal:

```bash
cd backend-go
go run ./cmd/cagnard-backend ../examples/run/oidc-keycloak/cagnard.conf
```

Start the frontend using the [development setup](../../../docs/getting-started/development.md), then open [http://localhost:5173](http://localhost:5173). Use **localhost**, not `127.0.0.1`, because origin and callback matching are exact.

| Login | Credentials | Expected access |
| --- | --- | --- |
| Local form | `alice` / `cagnard` | Engineering: own home and shared root |
| Keycloak SSO | `sso-alice` / `cagnard-sso` | Same engineering actions, separate identity-derived home |
| Keycloak SSO | `unassigned` / `cagnard-sso` | Authenticated with no storage roots |

Local Alice's existing home is preserved with `storageKey = alice`. SSO Alice has a different canonical identity and derived home. Create its root directory as an operator before browsing it, or test against the shared root. Do not link homes by email.

## Exercise failures and lifetime

Start SSO in two tabs: the later attempt replaces the pending transaction, so the earlier callback must fail. Stop Keycloak and try SSO again: static login remains available. With cached discovery, Cagnard can still redirect you to an unavailable IdP; a fresh backend fails discovery and shows the safe SSO-unavailable message. The failure location depends on whether discovery was cached. Set a short `ttlSeconds` and restart Cagnard to exercise session/task expiry on disposable files.

Local logout clears only Cagnard's cookie; Keycloak may sign the next attempt in automatically. Use Keycloak's account/admin UI or a separate browser profile to switch IdP users. The local admin console is [http://localhost:8081/admin](http://localhost:8081/admin), with `admin` and the password from `.env.example`.

Session lifetime is capped by the ID token’s expiry as well as Cagnard’s TTL; see [session lifetimes](../../../docs/reference/identity-and-sessions.md#session-model). The imported client requires S256 and includes `/groups` in the ID token. Changing IdP group membership does not update an existing Cagnard snapshot; sign in again or wait for expiry. Current application bindings are evaluated after a configuration restart.

## Stop and reset

```bash
docker compose --env-file examples/run/oidc-keycloak/.env.example \
  -f examples/run/oidc-keycloak/docker-compose.yaml down
```

The realm uses disposable container storage and is reimported on the next fresh start. Stop the host backend/frontend separately. The automated backend suite also runs an isolated protocol fixture for negative tokens, replay, JWKS rotation, expiry, and outage; live Keycloak validation still requires a running Docker engine.
