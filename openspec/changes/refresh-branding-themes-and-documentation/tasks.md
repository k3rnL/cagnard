## 1. Stateless appearance configuration

- [x] 1.1 Add typed appearance configuration with `classic`/`solar` palette, `light`/`dark`/`system` mode, `allowUserOverride`, and backward-compatible defaults
- [x] 1.2 Decode and validate the optional HOCON `appearance` section with explicit startup diagnostics for unsupported values
- [x] 1.3 Add a dedicated unauthenticated appearance discovery response and `GET /api/appearance` route that exposes no protected configuration
- [x] 1.4 Add backend tests for missing/default appearance, each valid value, invalid values, override locking, and response safety
- [x] 1.5 Update canonical, S3, runnable-example, and Helm HOCON declarations with documented appearance defaults where useful

## 2. Brand asset system

- [x] 2.1 Add the supplied filled and outlined source artwork to a maintained brand source directory with clear naming and provenance notes
- [x] 2.2 Produce and visually inspect an optimized transparent mark plus filled/outlined app and editorial PNG derivatives without altering the logo geometry
- [x] 2.3 Add appropriately sized favicon and application assets under the frontend public asset tree and wire favicon metadata in `frontend/index.html`
- [x] 2.4 Build a reusable Cagnard brand-mark component using the filled mark on a stable black 8 px rounded tile
- [x] 2.5 Replace the placeholder `C` mark in the login screen and authenticated sidebar while preserving their existing layout dimensions

## 3. Frontend appearance foundation

- [x] 3.1 Add frontend appearance types, API client support, enum validation, and versioned browser-local preference serialization
- [x] 3.2 Implement deterministic appearance precedence for operator lock, valid local preference, configured default, and system color-scheme resolution
- [x] 3.3 Apply cached/system appearance before React renders and reconcile it with `/api/appearance` without blocking login on discovery failure
- [x] 3.4 Add a focused appearance provider/hook that reacts to palette changes and live `prefers-color-scheme` changes independently of storage browser state
- [x] 3.5 Build one accessible appearance selector with palette swatches and Light/System/Dark segmented controls
- [x] 3.6 Render the selector on the login screen and authenticated sidebar only when user overrides are allowed
- [x] 3.7 Add focused tests for precedence, locked configuration, malformed local state, persistence, and system-mode changes

## 4. Semantic theme migration

- [x] 4.1 Inventory existing color usage and define semantic tokens for surfaces, text, borders, accent/focus, overlays, shadows, selection, and semantic statuses
- [x] 4.2 Implement Classic light tokens that preserve the current green appearance and complete Classic dark tokens
- [x] 4.3 Implement Solar light and dark tokens using neutral surfaces and the logo-derived amber/orange accent family
- [x] 4.4 Migrate the application shell, login, navigation, browser toolbar, breadcrumbs, listing, pagination, metadata, and responsive drawer to semantic tokens
- [x] 4.5 Migrate dropdowns, modals, toasts, pasteboard, transfer queue, progress, conflicts, disabled states, and loading transitions to semantic tokens
- [x] 4.6 Migrate file opener chrome, text/source views, syntax highlighting, JSON/YAML, CSV, logs, diffs, archives, and media containers to theme-compatible tokens
- [x] 4.7 Apply native `color-scheme`, visible keyboard focus, non-color state cues, and constrained-viewport appearance-selector styling
- [x] 4.8 Scan remaining CSS color literals and retain them only inside theme definitions or intrinsic content-specific rendering with a documented reason

## 5. Release-first runnable examples

- [x] 5.1 Make the local-filesystem Compose example default to compatible released GHCR frontend/backend images with one documented version override
- [x] 5.2 Add an explicit Compose source-build override or equivalent contributor command while keeping the release-first path simple
- [x] 5.3 Apply the same compatible image/version model to the S3/MinIO and combined-provider examples
- [x] 5.4 Reconcile every runnable-example HOCON file with current authentication, appearance, storage, and UI opener manifest requirements, including declared `view`
- [x] 5.5 Refresh example environment files and READMEs so commands, ports, demo credentials, cleanup, release use, and source builds match the actual artifacts
- [x] 5.6 Refresh pure Helm example values to match current image, configuration, appearance, and UI plugin contracts

## 6. Task-oriented documentation rewrite

- [x] 6.1 Replace the flat feature inventory with a documentation portal organized by getting started, guides, operations, architecture, reference, and contributing
- [x] 6.2 Write a clean-machine Docker getting-started guide using the release-first local filesystem example
- [x] 6.3 Write a Helm getting-started guide using `oci://ghcr.io/k3rnl/charts/cagnard`, maintained starter values, port access, and demo authentication
- [x] 6.4 Write a source-development guide for the Go backend, React frontend, local example builds, tests, Mocker scope, and common workflows
- [x] 6.5 Rewrite user guides for browsing/transfers, file viewers, users/storage access, S3/MinIO, and appearance around user goals and known limitations
- [x] 6.6 Rewrite operations documentation for HOCON configuration, deployment, secrets/security, health, releases, images, Helm, and production adaptation
- [x] 6.7 Rewrite architecture/reference documentation for the stateless runtime, provider capability model, UI opener model, transfer tasks, and detailed configuration
- [x] 6.8 Add contributor documentation for testing, example maintenance, documentation upkeep, and mapping OpenSpec feature areas to reader-facing coverage
- [x] 6.9 Replace established `docs/features/` pages with accurate compatibility pointers where needed and update all repository-internal links
- [x] 6.10 Add a repository-local Markdown link and referenced-asset validator and include it in the documented validation workflow

## 7. README and project imagery

- [x] 7.1 Generate and optimize a wide README banner using the outlined Cagnard mark without embedding essential rasterized text
- [x] 7.2 Start a safe combined-provider demo and capture a current desktop screenshot that shows real Cagnard browsing or opener functionality without private data
- [x] 7.3 Rewrite the root README with the banner, “Built in Occitania for files that live everywhere,” concise product benefits, release/validation badges, screenshot, feature/provider overview, and short Docker/Helm entry points
- [x] 7.4 Add useful brand and screenshot imagery to the documentation portal and appearance guide with descriptive alternative text
- [x] 7.5 Review the rendered README at normal and narrow GitHub widths and remove unsupported badges, stale commands, excessive detail, or unreadable imagery

## 8. Verification and handoff

- [x] 8.1 Run all Go backend tests and frontend typecheck/build checks
- [x] 8.2 Run HOCON, Docker Compose, Helm lint/template, and all runnable-example validation scripts
- [x] 8.3 Verify login and authenticated browser states in Classic light/dark and Solar light/dark at desktop and constrained viewports
- [x] 8.4 Exercise theme-sensitive menus, modals, toasts, pasteboard, task queue, metadata, selection, errors, file openers, and keyboard focus during visual verification
- [x] 8.5 Verify system-mode live changes, persistence after reload, invalid local preference fallback, and operator-locked appearance behavior
- [x] 8.6 Run documentation link/asset validation, inspect generated image sizes, and confirm no real credentials or private data appear in screenshots or examples
- [x] 8.7 Update affected maintained feature documentation and OpenSpec artifacts with any implementation decisions discovered during verification
- [x] 8.8 Run `git diff --check` and strict OpenSpec validation for `refresh-branding-themes-and-documentation`
