import { describe, expect, it } from "vitest";

import {
  currentDirectoryDownloadUnavailableReason,
  downloadSourcesForTarget,
  resolveBrowserActionContext,
  resolveBrowserRefreshTarget,
} from "./browserActions";
import type { NavigationRoot, StorageEntry } from "./types";

const file = entry("opened.json", "docs/opened.json", "file");
const selected = entry("selected.txt", "docs/selected.txt", "file");

describe("browser action context", () => {
  it("prefers an opened page file over a stale hidden selection", () => {
    expect(resolveBrowserActionContext({
      pageOpenedFile: file,
      selectedEntries: [selected],
      currentPath: "docs",
    })).toEqual({
      primaryTransfer: "download",
      downloadTarget: { kind: "opened-file", entries: [file] },
    });
  });

  it("downloads the visible selection while browsing or previewing inline", () => {
    expect(resolveBrowserActionContext({
      selectedEntries: [selected],
      currentPath: "docs",
    })).toEqual({
      primaryTransfer: "download",
      downloadTarget: { kind: "selection", entries: [selected] },
    });
  });

  it("makes upload primary and targets the complete current directory without selection", () => {
    expect(resolveBrowserActionContext({
      selectedEntries: [],
      currentPath: "nested\\folder/",
    })).toEqual({
      primaryTransfer: "upload",
      downloadTarget: { kind: "current-directory", path: "nested/folder" },
    });
  });

  it("keeps the configured root as an explicit empty-path target", () => {
    expect(resolveBrowserActionContext({ selectedEntries: [], currentPath: "" }))
      .toMatchObject({ downloadTarget: { kind: "current-directory", path: "" } });
  });

  it("explains missing current-directory capabilities", () => {
    expect(currentDirectoryDownloadUnavailableReason(root())).toBeUndefined();
    expect(currentDirectoryDownloadUnavailableReason(root([
      { name: "recursive-list", status: "unsupported", description: "No recursive listing" },
      { name: "stream-read", status: "supported" },
    ]))).toBe("No recursive listing");
    expect(currentDirectoryDownloadUnavailableReason(undefined)).toBe(
      "No storage root selected",
    );
  });

  it("refreshes only a page-level viewer as an opened file", () => {
    expect(resolveBrowserRefreshTarget("page")).toBe("opened-file");
    expect(resolveBrowserRefreshTarget("inline")).toBe("directory");
    expect(resolveBrowserRefreshTarget(undefined)).toBe("directory");
  });

  it("dispatches the exact resolved target paths to the download API", () => {
    const targetRoot = root();
    expect(downloadSourcesForTarget(targetRoot, {
      kind: "current-directory",
      path: "",
    })).toEqual([{ tunnel: "personal", rootId: "home", path: "" }]);
    expect(downloadSourcesForTarget(targetRoot, {
      kind: "selection",
      entries: [selected, file],
    })).toEqual([
      { tunnel: "personal", rootId: "home", path: "docs/selected.txt" },
      { tunnel: "personal", rootId: "home", path: "docs/opened.json" },
    ]);
    expect(downloadSourcesForTarget(targetRoot, {
      kind: "opened-file",
      entries: [file],
    })).toEqual([
      { tunnel: "personal", rootId: "home", path: "docs/opened.json" },
    ]);
  });
});

function entry(name: string, path: string, kind: string): StorageEntry {
  return {
    id: path,
    name,
    path,
    kind,
    metadata: { unavailable: [] },
    capabilities: [],
    providerSpecific: {},
  };
}

function root(
  capabilities: NavigationRoot["capabilities"] = [
    { name: "recursive-list", status: "supported" },
    { name: "stream-read", status: "supported" },
  ],
): NavigationRoot {
  return {
    id: "home",
    label: "Home",
    tunnel: "personal",
    providerId: "local",
    accountId: "alice",
    providerFamily: "unix",
    readOnly: false,
    capabilities,
  };
}
