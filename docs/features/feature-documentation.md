# Feature Documentation

## Behavior

Cagnard keeps user and operator documentation alongside specs and implementation. Feature docs are stored under `docs/features/` and linked from `docs/README.md`.

Each feature page should cover:

- implemented behavior
- relevant configuration
- operational notes
- known limitations

## Maintenance Rule

Every change that adds or modifies implemented behavior must update the matching feature documentation before the OpenSpec change is archived.

If a new spec or feature area is added, add a new documentation page and link it from the docs index.

## Operational Notes

- Documentation is hand-maintained Markdown for now.
- OpenSpec remains the normative requirements source.
- Docs are the practical user/operator surface.

## Known Limitations

- Documentation freshness is currently enforced by workflow discipline, not an automated linter.
