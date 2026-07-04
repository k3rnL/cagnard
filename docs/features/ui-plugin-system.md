# UI Plugin System

## Behavior

UI plugins declare frontend extension points for file openers and future file manipulation actions.

The implemented path is file opening:

- plugin manifests come from backend configuration
- the frontend matches opened files by MIME type, extension, category, and priority
- built-in openers use the same registry path as configured plugins
- backend bounded text content or raw downloads are requested only after the user explicitly opens a file

## Configuration

UI plugins are declared under `uiPlugins`.

Important fields:

- `id`
- `kind`
- `apiVersion`
- `mimeTypes`
- `extensions`
- `permissions`
- `priority`
- `categories`
- `mode`
- `editMode`
- `readStrategy`
- `saveStrategy`
- `maxSizeBytes`
- `requiredCapabilities`

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
