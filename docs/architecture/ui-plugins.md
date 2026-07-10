# File Opener And UI Plugins

Cagnard opens files through declarative opener manifests. First-party openers and operator-configured manifests compete in one ordered registry, so specialized formats can override a general MIME handler without changing the browser shell.

## Selection

An opener can match MIME types, extensions, and normalized file categories. Lower numeric `priority` wins. Selection also checks size limits, read strategy, and required provider capabilities. A rejected specialized opener does not break browsing; Cagnard can fall back to another compatible opener or metadata-only handling.

## Rendering Surfaces

Configured manifests target maintained frontend views such as `text`, `json`, `csv`, `markdown`, `media`, `pdf`, or `archive`. A `.jsonl` declaration can therefore route JSON Lines to text while normal `.json` continues to use the structured JSON view.

This is an extension point for selection and behavior, not arbitrary remote JavaScript loading. Executable third-party UI bundles, sandboxing, and independent plugin distribution remain future work.

## Read And Save Strategies

- `bounded`: request content in controlled chunks; default for text-like content.
- `download`: retrieve the complete content when the declared size limit permits it.
- `metadata`: open without fetching file bytes.
- `overwrite`: save edited content back to the current file when provider/root capabilities allow it.
- `export-only`: produce a new downloadable or storable result without overwriting the source.

An opener also declares viewer/editor mode, permissions, maximum size, and required capabilities. The frontend treats the server manifest as configuration and still applies root read-only and entry capability checks.

## Adding An Opener Declaration

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

When adding a new rendering surface or executable plugin mechanism, update frontend contract tests, security documentation, examples, and accessibility behavior in all four themes.
