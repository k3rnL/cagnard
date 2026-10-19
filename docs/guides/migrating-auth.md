# Migrating authentication to version 2

This is a coordinated binary/configuration change. V2 rejects `auth.mode`, `configuredUsersEnabled`, `defaultUser`, `staticProvider`, `oidcProviders`, top-level `users`, per-user `roles`/`claims`, root `allowedUsers`/`allowedRoles`/`allowedGroups`, and old path substitutions. There is no dual-policy fallback.

Read the [model guide](users-and-storage-access.md) and compare your deployment with the [full example](../../config/cagnard.oidc.example.conf).

## Preserve identities and passwords

Move each static user under an enabled `auth.providers[]` object with `type = static`. Preserve the old static provider ID and user ID. Add explicit `enabled = true` to the provider and each intended user. Keep existing compatible PBKDF2 verifiers; do not reset passwords merely to migrate the schema.

Set `auth.version = 2`, the exact browser `publicUrl`, and a fresh `auth.session.key` containing 32 random base64-encoded bytes. Production requires HTTPS and Secure cookies. Existing cookies are invalidated and everyone must sign in again. Request authentication no longer accepts bearer tokens.

## Declare groups and roles

Declare every application group referenced by static users or external mappings. Do not turn an old `admin` string into automatic full access. Choose an explicit action role reflecting the operations that old access permitted:

```hocon
authorization {
  groups = [{ id = engineering }, { id = legacy-admins }]
  roles = [{
    id = manager
    actions = ["storage.list", "storage.read", "storage.write", "storage.mkdir", "storage.rename", "storage.delete"]
  }]
  bindings = [{
    subjects = [
      { providerId = static, subject = alice },
      { group = engineering },
      { group = legacy-admins }
    ]
    roles = [manager]
    roots = [{ tunnel = global, rootId = shared }]
  }]
}
```

This preserves the old **OR** selector behavior for `allowedUsers=[alice]`, `allowedGroups=[engineering]`, and `allowedRoles=[admin]` only if users previously assigned `admin` are explicitly placed in `legacy-admins`. Alternatively, enumerate their provider-qualified subjects. Review each old role's actual membership; roles were previously undeclared strings.

A formerly unrestricted root needs a deliberate binding with `subjects = [{ authenticated = true }]` if that broad audience is still intended. Omitting a binding now denies access. Account `readOnly` remains a ceiling over any role. Keep root IDs/tunnels stable to preserve URLs.

## Preserve existing homes

Replace `{user.id}` or `{user.name}` with `{principal.storageKey}` and assign each static user's old directory segment explicitly:

```hocon
# In the static alice user:
storageKey = alice
# In the home root:
path = "/srv/cagnard/homes/{principal.storageKey}"
```

The default key is now derived from canonical identity, so omitting the override can point at a new home. Claim-based targets must be replaced by reviewed safe key assignments. The same template works in S3 prefixes. Explicit keys cannot be duplicated; intentionally shared data needs a shared root.

When switching an existing person from static to OIDC, obtain their verified IdP `sub`. Reassign the old storage key deliberately using [OIDC storage overrides](../reference/storage-access.md#storage-key-model); names and emails do not link identities. No filesystem data is moved automatically.

## Deploy and roll back

1. Preserve the current binary/image, configuration, session-secret backup, and storage backup under your normal secret controls.
2. Prepare v2 configuration with reviewed groups, bindings, home assignments, exact origin, and fresh key. Validate using the **new** backend; older released images cannot load v2.
3. Deploy matching backend/frontend builds and config together. Use v0.12.0 or later with auth v2; do not combine the v2 examples with earlier images. Use the repository Compose build override when testing local source changes.
4. Check static recovery login, SSO, an unassigned user, each audience's roots, denied actions, account ceilings, and transfers on disposable content. Compare actual home paths before allowing writes.
5. Restart all replicas consistently. No hot reload exists. Keep one backend or task affinity because tasks are process-local.

For rollback, restore the matching previous binary **and** its previous configuration together, rotate the restored session secret, and require fresh login. A rollback does not undo filesystem/S3 writes, copied data, or changed ownership assignments. Reconcile those separately from backups/audit records. Restarting loses in-memory tasks; do not replay partially completed destructive work automatically.

See [security operations](../operations/security.md), [session freshness](../reference/identity-and-sessions.md#freshness-and-invalidation), and [task continuation](../architecture/tasks.md#authentication-and-continuation).
