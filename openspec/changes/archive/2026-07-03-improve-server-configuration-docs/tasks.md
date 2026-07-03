## 1. HOCON Configuration

- [x] 1.1 Add the HOCON parser dependency to the backend build.
- [x] 1.2 Update `ConfigLoader` to parse, resolve, and decode HOCON while preserving relative path resolution.
- [x] 1.3 Replace the canonical JSON example with a HOCON example configuration.
- [x] 1.4 Update backend default config path and README startup instructions.
- [x] 1.5 Add backend tests for HOCON loading, includes, substitutions, invalid syntax, and typed decode diagnostics.

## 2. Feature Documentation

- [x] 2.1 Add a documentation index reachable from README.
- [x] 2.2 Add maintained feature documentation pages for current spec areas.
- [x] 2.3 Document HOCON configuration format, overrides, example settings, and known limitations.
- [x] 2.4 Document the requirement that future feature/spec changes update corresponding docs.

## 3. Verification

- [x] 3.1 Run backend tests.
- [x] 3.2 Run frontend typecheck/build to catch documentation or config reference regressions.
- [x] 3.3 Run OpenSpec validation for the change.
- [x] 3.4 Restart local servers on `0.0.0.0` and verify health/UI endpoints.
