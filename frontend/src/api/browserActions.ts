import type {
  NavigationRoot,
  StorageEntry,
  TaskSourceRequest,
} from "./types";

export type BrowserDownloadTarget =
  | { kind: "opened-file"; entries: [StorageEntry] }
  | { kind: "selection"; entries: StorageEntry[] }
  | { kind: "current-directory"; path: string };

export interface BrowserActionContext {
  downloadTarget: BrowserDownloadTarget;
  primaryTransfer: "download" | "upload";
}

export type BrowserRefreshTarget = "opened-file" | "directory";

export function resolveBrowserActionContext({
  pageOpenedFile,
  selectedEntries,
  currentPath,
}: {
  pageOpenedFile?: StorageEntry;
  selectedEntries: StorageEntry[];
  currentPath: string;
}): BrowserActionContext {
  if (pageOpenedFile) {
    return {
      downloadTarget: { kind: "opened-file", entries: [pageOpenedFile] },
      primaryTransfer: "download",
    };
  }
  if (selectedEntries.length > 0) {
    return {
      downloadTarget: { kind: "selection", entries: selectedEntries },
      primaryTransfer: "download",
    };
  }
  return {
    downloadTarget: {
      kind: "current-directory",
      path: normalizeBrowserActionPath(currentPath),
    },
    primaryTransfer: "upload",
  };
}

export function currentDirectoryDownloadUnavailableReason(
  root: NavigationRoot | undefined,
): string | undefined {
  if (!root) return "No storage root selected";
  for (const name of ["recursive-list", "stream-read"]) {
    const capability = root.capabilities.find((candidate) =>
      candidate.name === name
    );
    if (capability?.status !== "supported") {
      return capability?.description ??
        `This storage does not support ${name.replaceAll("-", " ")}.`;
    }
  }
  return undefined;
}

export function resolveBrowserRefreshTarget(
  openedFilePlacement: "page" | "inline" | undefined,
): BrowserRefreshTarget {
  return openedFilePlacement === "page" ? "opened-file" : "directory";
}

export function downloadSourcesForTarget(
  root: Pick<NavigationRoot, "id" | "tunnel">,
  target: BrowserDownloadTarget,
): TaskSourceRequest[] {
  if (target.kind === "current-directory") {
    return [{ tunnel: root.tunnel, rootId: root.id, path: target.path }];
  }
  return target.entries.map((entry) => ({
    tunnel: root.tunnel,
    rootId: root.id,
    path: entry.path,
  }));
}

function normalizeBrowserActionPath(value: string): string {
  const segments = value.replaceAll("\\", "/").split("/").filter((part) =>
    part && part !== "."
  );
  return segments.join("/");
}
