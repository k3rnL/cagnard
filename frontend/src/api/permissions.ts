import type { NavigationRoot, StorageAction } from "./types";

export function allows(root: Pick<NavigationRoot, "actions" | "readOnly"> | undefined, action: StorageAction): boolean {
  return Boolean(root?.actions?.includes(action) && (!root.readOnly || action === "storage.list" || action === "storage.read"));
}
