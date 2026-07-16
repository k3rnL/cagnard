## Context

Cagnard currently renders a placeholder `C` tile in the login screen and sidebar, has no favicon or maintained frontend asset directory, and expresses the entire visual palette as repeated color literals in a 2,200-line stylesheet. The current green theme is coherent, but it cannot be varied safely because component selectors own both structure and color.

The project documentation has grown alongside OpenSpec capabilities. It contains useful operational information, but its primary index is a flat list of internal feature/spec names. New users must infer the correct sequence across backend runtime, deployment packaging, authentication, examples, and storage features before they can start the product. Runnable examples exist for filesystem, S3/MinIO, and combined storage, but their default path is oriented toward repository builds and some declarations need reconciliation with the current opener manifest contract.

The backend remains stateless and HOCON-driven. Appearance defaults therefore need to follow the same model, while a personal visual preference is harmless browser-local state and does not justify a user settings database. Appearance is required before authentication because the login screen is themed.

## Goals / Non-Goals

**Goals:**

- Establish the supplied Cagnard mark as the product identity across the app, browser chrome, README, and documentation.
- Retain the current green appearance as Classic and add a logo-derived Solar palette, with complete light and dark modes for both.
- Move all application chrome to semantic visual tokens and provide accessible palette/mode controls on authenticated and unauthenticated surfaces.
- Support stateless operator defaults and an optional override lock through HOCON, with browser-local user preference when permitted.
- Make the README an effective product front door with a subtle Occitania reference, real screenshot, concise benefits, and short startup paths.
- Rebuild `docs/` around reader goals while preserving behavioral, operational, limitation, and contributor coverage.
- Make released Docker images and the published OCI Helm chart the primary onboarding paths, while retaining explicit source-build workflows.

**Non-Goals:**

- Arbitrary administrator-defined colors, uploaded theme packages, CSS injection, or theme plugins.
- White-label product names or replacement logos configured by an operator.
- Server-side persistence or cross-device synchronization of a user's appearance preference.
- Introducing Docusaurus, MkDocs, or a separately deployed documentation site.
- Changing storage, transfer, authentication, or opener semantics except where examples and documentation are stale.
- Choosing or adding a project software license; the README must not imply one until a license exists.

## Decisions

### Preserve source artwork and derive purpose-specific assets

Store the two supplied source images in a maintained brand source directory. Produce a transparent mark and optimized raster derivatives for app use instead of loading the 890 KB–1.3 MB source images in the frontend. The filled mark is used for the sidebar, login, and favicon because its silhouette survives small sizes; the outlined mark is reserved for the wide README banner and larger documentation contexts. The in-app mark is composed on a black, 8 px rounded tile so it remains stable across all themes.

The README banner is a wide bitmap using the outlined mark and restrained storage/network visual cues. It contains no essential text so rendering quality, localization, and accessibility do not depend on text embedded in an image. The README screenshot is captured from a real combined-provider demo after the theme migration, using safe fixtures and a representative browser/file-opener state.

Alternative considered: use the original square PNG directly everywhere. Rejected because it wastes bandwidth, has no transparency, becomes muddy in a favicon, and provides no flexible editorial asset.

### Use palette and mode as independent appearance dimensions

Define two palette identifiers, `classic` and `solar`, and three requested modes, `light`, `dark`, and `system`. `system` resolves to a concrete light/dark mode through `prefers-color-scheme`; changes to that media query update the active theme while the app is open.

The document root receives stable attributes such as `data-palette="classic"` and `data-mode="dark"`. Palette/mode selectors define semantic custom properties for canvas, panels, raised surfaces, text, muted text, borders, accent states, focus, selection, overlays, shadows, success, warning, danger, information, code, diff, log, and progress colors. Component rules consume only semantic properties except where file content itself has an intrinsic color.

Classic light starts from the current `#255f54` accent and off-white surfaces. Classic dark uses deep neutral-green surfaces and a lighter teal accent. Solar light and dark use neutral surfaces with amber/orange accents sampled from the new mark; orange is not used as the only indicator for warning or failure.

Alternative considered: implement dark mode with a late CSS override layer. Rejected because the existing stylesheet repeats many literals and such an override would leave menus, opener states, semantic statuses, and future components inconsistent.

### Resolve appearance from operator policy and browser preference

Add an optional HOCON section:

```hocon
appearance {
  defaultPalette = classic
  defaultMode = system
  allowUserOverride = true
}
```

The backend validates the enum values at startup and exposes only these non-sensitive fields through `GET /api/appearance`, which is available before authentication. Defaults preserve current deployments when the section is absent.

The frontend resolves effective appearance in this order:

1. If `allowUserOverride` is false, use the configured defaults.
2. Otherwise use a valid browser-local palette and requested mode when present.
3. Fall back to the configured defaults.
4. Resolve `system` to the browser's current light/dark preference.

The local preference key is versioned and stores only palette/mode identifiers. It is device/browser presentation state, contains no identity or authorization data, and may persist across browser restarts. Theme initialization runs before the React shell mounts; a small synchronous bootstrap applies a valid cached preference/system mode immediately, then the appearance discovery response confirms or replaces it before interactive UI is shown. Failure to load appearance falls back to Classic/System rather than blocking login.

Alternative considered: use only frontend constants. Rejected because Cagnard's deployment model is explicitly configuration-driven and operators need a consistent default or locked presentation. Server-side user settings were rejected because they conflict with the stateless backend goal for a cosmetic preference.

### Provide one reusable appearance control

Create a focused appearance provider/hook and one reusable selector rendered in both the login panel and authenticated sidebar. The control uses visual swatches for Classic/Solar and a segmented Light/System/Dark mode selector, with labels, keyboard behavior, visible focus, and current-state semantics. On constrained layouts it opens as an anchored popover or compact panel that remains within the viewport.

At widths below the desktop sidebar breakpoint, navigation becomes a compact grid: identity, session, personal roots, global roots, and appearance remain directly available without consuming most of the viewport. The informational UI-plugin list is omitted from that constrained header, while plugin behavior remains active in file opening. At narrow phone widths the grid becomes two columns and the main browser remains independently scrollable.

No theme state is added to the broad storage browser data hook. Appearance has a separate lifecycle and must work before authentication.

### Reframe documentation around tasks and audiences

Keep portable GitHub-flavored Markdown and organize the maintained entry points as:

```text
docs/
  README.md
  getting-started/   docker, helm, development
  guides/            browsing/transfers, previews, access, S3/MinIO, appearance
  operations/        configuration, deployment, security, releases
  architecture/      overview, storage plugins, UI plugins, transfer jobs
  reference/         detailed configuration and capability references
  contributing/      testing and documentation maintenance
  assets/            brand and screenshots used by Markdown
```

Pages are written for a reader goal, not copied one-for-one from specs. A contributor-facing documentation maintenance page maps implemented capabilities to the appropriate reader-facing section so OpenSpec traceability remains possible. Established `docs/features/...` paths that are likely to be linked externally become short compatibility pointers rather than disappearing silently. A repository script validates local Markdown links and referenced assets.

Alternative considered: add a documentation-site generator. Rejected for this change because Markdown already renders well on GitHub and a generator would add deployment, dependency, navigation syntax, and theme work unrelated to improving the content.

### Make onboarding release-first and development explicit

The shortest Docker guide uses the local filesystem/static-user Compose example with compatible released images from GHCR. Image coordinates and version remain overrideable through the example environment file. A separate Compose override or explicit documented command adds the repository `build` definitions for contributors.

The Helm guide installs `oci://ghcr.io/k3rnl/charts/cagnard` and uses maintained demo values suitable for a disposable cluster. It then distinguishes production configuration, persistence, ingress, TLS, and Kubernetes Secret usage. Documentation does not present inline demo credentials as production-safe.

All HOCON and Helm examples are updated to current required fields, including opener `view` declarations, and continue through existing configuration, Compose, and Helm validation scripts.

### Treat the visual change as a cross-state verification problem

Backend tests cover appearance defaulting, validation, and public response safety. Frontend logic tests cover precedence, invalid local values, system changes, and locked configuration. Browser verification covers login and authenticated browser states for all four palette/mode combinations at desktop and constrained viewports. It also exercises menus, modals, pasteboard, task queue, metadata, toasts, selection, file openers, and keyboard focus. The final README screenshot is captured only after those checks pass.

## Risks / Trade-offs

- **[Risk] CSS token migration misses a rarely used state** → Inventory color literals, migrate by semantic role, and visually exercise overlays, errors, conflicts, openers, and responsive states in all themes.
- **[Risk] Theme bootstrap causes a light/dark flash** → Apply valid cached/system state synchronously and resolve operator policy before mounting interactive UI.
- **[Risk] Public appearance discovery leaks configuration** → Use a dedicated response containing only palette, mode, and override policy; do not serialize the general backend config.
- **[Risk] Automatic background removal damages logo edges** → Preserve source files, visually inspect transparent derivatives at full and favicon sizes, and use the original black-tile composition where edge quality is uncertain.
- **[Risk] Reorganizing documentation breaks existing links** → Update repository links, retain compatibility pointers for established paths, and add local Markdown/asset validation.
- **[Risk] Pinned example versions become stale** → Keep one version variable per example and include example-version updates in the documented release checklist.
- **[Trade-off] Four themes increase visual QA cost** → Central semantic tokens and a fixed palette set keep the matrix bounded; arbitrary custom themes remain out of scope.
- **[Trade-off] Browser-local preference is not cross-device** → Accept this as consistent with the stateless backend and avoid introducing a settings store for cosmetic state.

## Migration Plan

1. Add optional appearance configuration, validation, tests, and the dedicated public discovery endpoint with backward-compatible defaults.
2. Add optimized brand assets and favicon metadata while preserving the existing layout dimensions.
3. Introduce appearance resolution and controls, then migrate stylesheet colors into semantic token definitions in bounded component groups.
4. Verify all theme combinations and responsive/application states before changing documentation imagery.
5. Rewrite the README and documentation hierarchy, retaining compatibility pointers and validating all links.
6. Make Compose onboarding release-first, add the explicit source-build path, refresh HOCON/Helm examples, and run example validators.
7. Generate the final banner and capture the real application screenshot, then perform final README rendering and accessibility review.

No persistent data migration is required. Rolling back the application behavior means removing the optional appearance endpoint/control and reverting components to Classic tokens; older configuration remains valid because the appearance section is optional. Documentation and asset rollback is a normal source-control revert.

## Open Questions

- The repository currently has no software license. License selection remains a separate maintainer decision; this change will omit license claims and badges rather than infer one.
