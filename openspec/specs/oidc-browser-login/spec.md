# oidc-browser-login Specification

## Purpose
Defines browser OIDC login, validated external identity, bounded sessions, and integrated static/SSO behavior.
## Requirements
### Requirement: Backend-managed OIDC authorization code flow
Cagnard SHALL implement browser OIDC login using authorization code with PKCE S256, state, nonce, a configured client identity, and a provider-specific callback. Token exchange and provider credentials SHALL remain in the backend. Callback URLs SHALL derive from the configured public URL and return paths SHALL remain local.

#### Scenario: Successful SSO login
- **WHEN** an enabled OIDC provider returns a valid callback for a browser-initiated login
- **THEN** Cagnard SHALL validate the transaction, exchange the code, validate identity, issue its common application session, and redirect to the approved local return path

#### Scenario: Unexpected callback
- **WHEN** callback state, nonce, transaction cookie, provider binding, or transaction expiry is invalid
- **THEN** Cagnard SHALL reject authentication without creating a session or falling back to another identity

#### Scenario: External return path
- **WHEN** a login request supplies an external or unsafe return URL
- **THEN** Cagnard SHALL reject it or use a fixed safe local destination without redirecting outside the application

### Requirement: Validated external identity
Cagnard SHALL use a maintained OIDC verifier to validate configured issuer, signature, permitted algorithm, client audience and authorized party, expiry, nonce, and non-empty subject. Discovery and key rotation SHALL use configured trusted provider endpoints with bounded network behavior. UserInfo, when used, SHALL match the verified subject.

#### Scenario: Invalid ID token
- **WHEN** a token has an invalid signature, issuer, audience, authorized party, expiry, nonce, algorithm, or subject
- **THEN** authentication SHALL fail and no empty or partial principal SHALL be returned

#### Scenario: Signing key rotation
- **WHEN** a trusted provider rotates its signing key
- **THEN** Cagnard SHALL refresh keys through the trusted provider configuration within bounded retries and accept only successfully verified tokens

#### Scenario: Unsupported bearer input
- **WHEN** a protected browser API receives an arbitrary external bearer token or an old Cagnard bearer session credential
- **THEN** Cagnard SHALL reject the unsupported credential rather than decode it as an authenticated principal

### Requirement: Stateless bounded login transactions
Cagnard SHALL protect short-lived login transaction state in an authenticated-encryption HttpOnly cookie and SHALL keep provider tokens out of the browser and application session. Cagnard SHALL support one pending transaction per browser profile initially and clear it after callback handling. Cagnard SHALL NOT claim server-side replay revocation from cookie deletion.

#### Scenario: Superseded login attempt
- **WHEN** a second login attempt replaces the pending browser transaction and the first callback arrives
- **THEN** Cagnard SHALL reject the stale callback with a safe retry message

#### Scenario: Code replay
- **WHEN** a callback attempts to reuse an already redeemed authorization code
- **THEN** the unsuccessful code exchange SHALL not produce another application session

### Requirement: Explicit external claim freshness
Cagnard SHALL retain only a bounded snapshot of validated configured claims needed for group mapping and SHALL apply current application mapping/binding configuration to that snapshot. External membership changes SHALL become effective at the next sign-in and SHALL be bounded by an absolute expiry at the earlier of ID-token expiry and the configured application lifetime, defaulting to one hour. Cagnard SHALL NOT silently refresh or extend external evidence.

#### Scenario: Changed local binding
- **WHEN** configuration is restarted with a changed role binding and the browser retains a valid OIDC session
- **THEN** the next authorized request SHALL use the new binding

#### Scenario: Changed IdP membership
- **WHEN** the identity provider removes a user's group during an active application session
- **THEN** Cagnard SHALL document that the existing snapshot can remain valid until expiry and SHALL require fresh authentication to obtain updated membership

#### Scenario: Oversize membership evidence
- **WHEN** the protected session would exceed the configured implementation cookie-size bound
- **THEN** login SHALL fail with safe actionable feedback and SHALL NOT truncate authorization data or issue a partial session

### Requirement: Integrated provider error experience
Cagnard SHALL display static and OIDC options through common provider discovery, with safe handling of provider outages, denied consent, and callback errors. Controls SHALL reuse existing themes, responsive layout, focus behavior, and accessible feedback.

#### Scenario: One provider unavailable
- **WHEN** an OIDC provider cannot complete discovery or login while static login remains enabled
- **THEN** Cagnard SHALL report the provider's unavailable state, keep static login usable, and SHALL NOT authenticate automatically through another provider

#### Scenario: Callback failure feedback
- **WHEN** the browser returns from a failed OIDC flow
- **THEN** the UI SHALL present a keyboard-accessible retry action and safe error text without displaying tokens, callback parameters, or unstable layout

### Requirement: Explicit provider TLS policy
Cagnard SHALL verify TLS certificate chains and hostnames by default using the backend trust store. An OIDC provider MAY explicitly set `trustAllCertificates = true`; when enabled Cagnard SHALL skip TLS certificate and hostname verification only on that provider's backend HTTP client, including discovery, token and signing-key requests. It SHALL preserve HTTPS requirements, bounded network behavior and all OIDC transaction and token validation checks, and SHALL warn on startup for each enabled provider with the exception. Changing the exception SHALL invalidate that provider's existing identity evidence.

#### Scenario: Private certificate without opt-in
- **WHEN** an OIDC server presents a certificate not trusted by the backend and the exception is absent or false
- **THEN** Cagnard SHALL reject the TLS connection and report a certificate-trust diagnostic

#### Scenario: Explicit exception
- **WHEN** an operator enables the exception for one provider
- **THEN** that provider's discovery, token exchange and key retrieval SHALL support untrusted certificates without changing other providers or accepting invalid ID tokens

#### Scenario: Trusted private CA
- **WHEN** an operator installs the provider's CA in the backend trust store
- **THEN** Cagnard SHALL support that provider with certificate verification enabled

### Requirement: Safe authentication diagnostics
Cagnard SHALL log OIDC login failures with the provider, failure stage and a bounded actionable reason. Network, certificate, issuer, HTTP, transaction, token and session failures SHALL be distinguishable. Cached discovery failures SHALL retain the original diagnostic and indicate backoff. Logs SHALL NOT contain client secrets, cookies, tokens, authorization codes, state/nonce values, or unfiltered upstream response/error text. Browser feedback SHALL remain generic.

#### Scenario: Discovery unavailable
- **WHEN** discovery fails because of DNS, TLS, timeout, non-success HTTP, invalid JSON or issuer mismatch
- **THEN** backend logs SHALL identify the corresponding reason and repeated attempts during backoff SHALL retain it

#### Scenario: Callback rejected
- **WHEN** transaction validation, token exchange, ID-token verification, claim extraction or session issuance fails
- **THEN** backend logs SHALL identify the failing stage and reason while keeping authentication material out of logs and browser responses

#### Scenario: Operator self-signed certificate setup
- **WHEN** an operator reads the OIDC deployment documentation
- **THEN** it SHALL explain trusted CA installation and the explicit verification bypass, their scope, risks, restart requirements and diagnostic fields, with links to the provider reference
