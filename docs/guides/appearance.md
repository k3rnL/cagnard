# Appearance

Cagnard includes two palettes, each with light and dark variants:

- **Classic** preserves the original restrained green interface.
- **Solar** uses neutral surfaces with amber and orange accents derived from the Cagnard mark.

![Solar light appearance while browsing JSON and Markdown objects](../assets/screenshots/storage-browser.png)

Use the palette control on the login screen or at the bottom of the sidebar. Light, System, and Dark modes are available. System mode tracks the browser's current `prefers-color-scheme` value while the app is open.

## Preference Behavior

When user overrides are enabled, the selected palette and requested mode are stored only in browser-local storage. Appearance does not create backend user state and does not synchronize across devices. Invalid local data is ignored safely.

## Operator Defaults

```hocon
appearance {
  defaultPalette = classic
  defaultMode = system
  allowUserOverride = true
}
```

Supported palettes are `classic` and `solar`. Supported modes are `light`, `dark`, and `system`. Invalid values fail backend startup with a configuration diagnostic.

Set `allowUserOverride = false` to lock the configured palette and mode and hide the selector. The login screen retrieves only these safe appearance fields from `/api/appearance`; no protected backend configuration is disclosed.

## Accessibility

All four concrete theme combinations share semantic colors for focus, selection, success, warning, error, transfer state, code, logs, and diffs. Status remains accompanied by text or iconography rather than relying on color alone. Native controls receive the active browser `color-scheme`.

Custom CSS, arbitrary operator colors, and uploaded theme plugins are intentionally unsupported in the current theme contract.
