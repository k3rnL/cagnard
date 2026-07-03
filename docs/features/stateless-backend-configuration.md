# Stateless Backend Configuration

## Behavior

The backend starts from configuration and external providers without a required application database. The same configuration should produce the same providers, users, access policies, and UI plugin declarations after restart.

The primary configuration format is HOCON. The default example path is `config/cagnard.example.conf`.

## Configuration

See [Backend configuration](../configuration.md).

Key runtime inputs:

- `CAGNARD_CONFIG` can point to a HOCON file.
- The first backend argument can also provide a config path.
- Relative storage root paths resolve against the config file directory.
- Container deployments can mount HOCON config and set `CAGNARD_CONFIG` without rebuilding the image.
- Helm deployments can render non-secret config as a ConfigMap or mount existing Secret/volume sources.

## Operational Notes

- Invalid HOCON or invalid typed configuration fails startup.
- Required runtime state must come from configuration, external identity providers, local process permissions, or future external secret providers.
- No schema migration or local database bootstrap is required.
- Secrets should remain in environment variables, mounted files, Kubernetes Secrets, or external secret systems, not baked into images.

## Known Limitations

- Hot reload is not implemented.
- OIDC validation is not complete in the prototype.
- Audit sinks beyond logs/files/external sinks remain future work.
