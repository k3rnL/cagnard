# Users And Storage Access

Cagnard separates authentication from storage authorization. Authentication produces one normalized principal; configuration maps that principal to personal and global storage roots.

## Personal And Global Areas

- **Personal** storage contains one or more user-specific homes, usually displayed as Home or My documents.
- **Global** storage contains administrator-defined shared roots filtered by user, role, or group.

The two tunnels are independent. A deployment can enable either one or both, and every operation keeps tunnel, provider, account, and root context.

## Static Users

Static login is suitable for simple and local deployments. Users are declared in HOCON with roles, groups, claims, and password verifier material. Plaintext passwords are not stored in application state.

```hocon
users = [
  {
    id = alice
    displayName = "Alice Example"
    roles = [user]
    groups = [engineering]
    credential { verifier = ${?ALICE_PASSWORD_VERIFIER} }
  }
]
```

Static login issues a signed stateless cookie. The backend resolves the current configured user on each request; no session database is required.

## Root Authorization

Roots can limit access with `allowedUsers`, `allowedRoles`, and `allowedGroups`. Personal paths may contain `{user.id}` to resolve a per-user filesystem home. Accounts can also be read-only, which blocks mutations before provider code runs.

```hocon
personalStorage = [
  {
    id = home
    label = "My documents"
    providerId = local
    accountId = local-process
    path = "/srv/cagnard/home/{user.id}"
    allowedGroups = [engineering]
  }
]
```

## External Identity

The authentication-provider discovery and normalized principal contracts are designed for OIDC/SSO, but external authentication remains incomplete in the current implementation. Do not configure `auth.mode = external` expecting a silent static fallback; startup or provider discovery reports the unsupported state.

See [Security](../operations/security.md) and the [configuration reference](../reference/configuration.md).
