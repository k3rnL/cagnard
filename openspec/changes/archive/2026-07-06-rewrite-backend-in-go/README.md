# rewrite-backend-in-go

Rewrite the Cagnard backend from Scala to Go while preserving the current provider-neutral storage model, stateless configuration contract, authentication behavior, browser APIs, transfer jobs, S3/filesystem providers, Docker/Helm deployment shape, documentation, and test coverage.

This change should treat the current Scala backend as the behavioral reference until specs explicitly change an API or runtime contract.
