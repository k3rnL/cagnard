import type { StorageEntry, UiPluginManifest } from "../api/types";

export interface PreviewMatch {
  plugin: UiPluginManifest;
  reason: string;
}

export function findPreviewPlugin(entry: StorageEntry, plugins: UiPluginManifest[]): PreviewMatch | undefined {
  const mimeType = entry.metadata.mimeType?.toLowerCase();
  const extension = extensionOf(entry.name);

  const matches = plugins
    .filter((plugin) => plugin.kind === "preview")
    .filter((plugin) => {
      const byMime = mimeType ? plugin.mimeTypes.map((value) => value.toLowerCase()).includes(mimeType) : false;
      const byExtension = extension ? plugin.extensions.map((value) => value.toLowerCase()).includes(extension) : false;
      return byMime || byExtension;
    })
    .sort((left, right) => left.priority - right.priority);

  const plugin = matches[0];
  if (!plugin) return undefined;

  return {
    plugin,
    reason: mimeType && plugin.mimeTypes.includes(mimeType) ? mimeType : (extension ?? "matched")
  };
}

function extensionOf(name: string): string | undefined {
  const index = name.lastIndexOf(".");
  return index > -1 ? name.slice(index).toLowerCase() : undefined;
}
