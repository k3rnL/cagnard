## Context

The backend currently decodes JSON configuration with Circe and uses that file as the stateless source of providers, accounts, users, roots, and UI plugins. That keeps runtime state simple, but JSON is a poor operator format because it cannot carry comments, includes, or convenient environment substitution.

The project also has specs but only a short README for users and operators. As features accumulate, implemented behavior needs a documentation surface that stays aligned with specs and code.

## Goals / Non-Goals

**Goals:**
- Make HOCON the primary backend configuration format.
- Keep the backend stateless and keep the existing typed configuration model.
- Preserve relative path resolution against the configuration file location.
- Provide a canonical HOCON example configuration.
- Establish documentation pages for feature/spec areas and link them from README.
- Make documentation updates part of the feature workflow.

**Non-Goals:**
- Add database-backed configuration or live distributed configuration state.
- Implement hot reload of configuration.
- Fully implement OIDC validation or external secret providers in this change.
- Build a generated documentation site.

## Decisions

### Use Typesafe Config as the HOCON parser

The backend will add `com.typesafe:config` and parse HOCON into a resolved `Config`. The resolved config will be rendered to JSON and decoded with the existing Circe case-class decoders.

Alternatives considered:
- PureConfig: good Scala ergonomics, but introduces a larger dependency surface and a second derivation model for the same case classes.
- Hand-written HOCON extraction: more control, but much more boilerplate for little benefit at this stage.

### Keep the existing configuration model

The existing `CagnardConfig` case classes remain the normalized backend model. HOCON changes the input format, not the internal model.

This limits blast radius across access control, storage registry, and API services.

### Make `.conf` the default path

The default runtime configuration becomes `config/cagnard.example.conf`. Operators can still pass a config path through `CAGNARD_CONFIG` or the first backend argument.

Typesafe Config can parse JSON-like HOCON when explicitly provided, but JSON is no longer the canonical example or documented runtime format.

### Use docs as maintained Markdown, not generated output

Add a `docs/` tree with an index and feature pages matching current spec areas. Each feature page records user-facing behavior, configuration notes, operational constraints, and known limitations.

Generated docs can be added later. For now, hand-maintained Markdown is simpler and lets feature work update docs in the same change.

## Risks / Trade-offs

- HOCON substitutions can fail at startup if required values are absent -> use explicit startup diagnostics and tests for invalid config.
- Rendering HOCON to JSON before Circe decoding can expose extra fallback keys -> Circe ignores unknown fields and the typed model remains the acceptance boundary.
- Documentation can drift if not enforced -> add OpenSpec requirements and task checklist items so feature changes update docs before archive.
- Removing the JSON example may surprise existing local users -> README and config docs call out the `.conf` path and `CAGNARD_CONFIG` override.

## Migration Plan

1. Add HOCON parser dependency and update `ConfigLoader`.
2. Replace the canonical example config with `config/cagnard.example.conf`.
3. Update default config path and README instructions.
4. Add docs index plus feature/spec documentation pages.
5. Add tests for HOCON loading, includes, substitutions, and invalid diagnostics.
6. Validate OpenSpec specs and run backend tests.

Rollback is straightforward: restore the previous JSON loader and example file, then point the default path back to `config/cagnard.example.json`.

## Open Questions

- Whether JSON should remain explicitly supported for one release as a compatibility path after the prototype stage.
- Whether documentation freshness should eventually be enforced by a lightweight script that checks feature docs exist for every main spec.
