# UI Plugin System

## Behavior

UI plugins declare frontend extension points for file openers and future file manipulation actions.

The implemented path is file opening:

- plugin manifests come from backend configuration
- the frontend matches opened files by MIME type, extension, category, and priority
- first-party openers are registered as manifests through the same path as configured plugins; there is no separate built-in code path
- each manifest declares a target `view` (rendering engine); a manifest without a recognized `view` falls back to the text view instead of being forced to text
- backend bounded text content, byte-range reads, or raw downloads are requested only after the user explicitly opens a file

## Configuration

UI plugins are declared under `uiPlugins`.

Important fields:

- `id`
- `kind` (`opener`; legacy `preview` is still accepted)
- `apiVersion`
- `mimeTypes`
- `extensions`
- `permissions`
- `priority` (lower wins; first-party openers occupy 10–200)
- `categories`
- `view` — target rendering surface: `text`, `json`, `yaml`, `diff`, `log`, `csv`, `markdown`, `media`, `pdf`, or `archive`. Defaults to `text` when omitted or unrecognized.
- `mode`
- `editMode`
- `readStrategy` (`bounded`, `download`, or `metadata`)
- `saveStrategy`
- `maxSizeBytes`
- `requiredCapabilities`

Example — route `.jsonl` files to the text view ahead of the first-party JSON opener:

```hocon
uiPlugins = [
  {
    id = jsonl-text
    label = "JSON Lines"
    kind = opener
    apiVersion = "1"
    enabled = true
    extensions = [".jsonl"]
    permissions = [read]
    priority = 15
    view = text
    readStrategy = bounded
    maxSizeBytes = 524288
  }
]
```

## Operational Notes

- Plugin selection is deterministic by priority.
- Plugins should receive scoped file access, not raw credentials.
- Opener failures do not block other file actions.
- Legacy `kind = preview` declarations are treated as bounded read-only text opener declarations.

## Known Limitations

- UI plugin code loading is not implemented; current plugins are declarations consumed by the core frontend.
- File manipulation plugins are specified but not implemented.
- Plugin isolation is specified but not enforced by a plugin runtime yet.
- Sandboxed third-party opener execution is not implemented yet.
