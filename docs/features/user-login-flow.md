# User Login Flow

## Behavior

Cagnard exposes authentication providers through `/api/auth/providers`. The frontend renders those providers without hardcoding static login as the only possible identity source.

The current implementation supports a static configured-user provider:

- `POST /api/auth/login` accepts provider id, username, and password.
- Successful login returns the normalized session profile and sets a signed stateless session cookie.
- Protected API routes resolve the current user from the signed session.
- `POST /api/auth/logout` returns success and clears the browser session cookie.

The frontend gates the storage browser behind authenticated session state. When a protected request returns unauthorized, it clears local session state and returns to the login view.

## Local Example

`config/cagnard.example.conf` enables static login:

```text
User: alice
Password: cagnard
```

## Extension Points

The provider discovery response already carries provider id, label, kind, optional login URL, credential fields, and capabilities. Future OIDC/SSO providers can use the same shape to render redirect buttons or provider-specific login controls without changing the storage browser contract.

Downstream authorization receives a normalized authenticated principal with id, display name, roles, groups, and claims. Storage providers and UI plugins do not receive submitted passwords or password verifier material.

## Security Notes

- Static-user passwords must be represented as verifier material, not plaintext config fields.
- Session signing secrets and password verifiers should be externalized in real deployments.
- Unknown usernames and invalid passwords return the same public authentication failure.
- Logout clears the browser credential; the backend remains stateless and does not keep a server-side session revocation table.
