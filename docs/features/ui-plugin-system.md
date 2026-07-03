# UI Plugin System

## Behavior

UI plugins declare frontend extension points for previews and future file manipulation actions.

The implemented path is text preview:

- plugin manifests come from backend configuration
- the frontend matches selected files by MIME type or extension
- backend preview content is rendered in the preview panel

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

## Operational Notes

- Plugin selection is deterministic by priority.
- Plugins should receive scoped file access, not raw credentials.
- Backend preview failures do not block other file actions.

## Known Limitations

- UI plugin code loading is not implemented; current plugins are declarations consumed by the core frontend.
- File manipulation plugins are specified but not implemented.
- Plugin isolation is specified but not enforced by a plugin runtime yet.
