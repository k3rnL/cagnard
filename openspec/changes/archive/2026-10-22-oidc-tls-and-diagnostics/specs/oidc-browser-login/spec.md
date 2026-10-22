## ADDED Requirements

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
