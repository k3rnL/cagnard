import { afterEach, describe, expect, it, vi } from "vitest";

import type { NavigationRoot, TaskResponse } from "./types";
import { cagnardApi } from "./client";
import {
  isActiveTask,
  isTerminalTask,
  mergeTasks,
  mergeTaskSnapshots,
  runWithConcurrency,
  taskMatchesCurrentLocation,
  taskOperationLabel,
  taskPollDelay
} from "./useCagnardData";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const root: NavigationRoot = {
  id: "home",
  label: "Home",
  tunnel: "personal",
  providerId: "local",
  providerFamily: "unix",
  accountId: "local-admin",
  readOnly: false,
  capabilities: []
};

function task(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: "task-1",
    status: "running",
    message: "Working",
    createdAt: "2026-07-17T10:00:00Z",
    updatedAt: "2026-07-17T10:00:00Z",
    operation: "copy",
    revision: 1,
    initiatedFrom: { tunnel: "personal", rootId: "home", path: "docs" },
    mutationCount: 0,
    progress: { bytesTransferred: 0, itemsCompleted: 0 },
    destination: { tunnel: "personal", rootId: "home", path: "archive" },
    conflictPolicy: "fail",
    tasks: [],
    results: [],
    ...overrides
  };
}

describe("generic task state", () => {
  it("keeps one identity and rejects stale revisions", () => {
    const latest = task({ revision: 4, status: "completed" });
    const merged = mergeTasks([latest], task({ revision: 3, status: "blocked" }));
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(latest);
  });

  it("keeps one task while a conflict is blocked, resolved, and completed", () => {
    const blocked = task({ revision: 1, status: "blocked" });
    const pending = task({ revision: 2, status: "pending", message: "Conflict resolved" });
    const completed = task({ revision: 3, status: "completed", mutationCount: 1 });

    const afterBlocked = mergeTasks([], blocked);
    const afterResolution = mergeTasks(afterBlocked, pending);
    const afterCompletion = mergeTasks(afterResolution, completed);

    expect(afterCompletion).toHaveLength(1);
    expect(afterCompletion[0]).toMatchObject({ id: "task-1", revision: 3, status: "completed" });
  });

  it("deduplicates snapshots and drops records cleared by the server", () => {
    const old = task({ id: "old", revision: 2 });
    const newest = task({ id: "same", revision: 5, status: "completed" });
    const snapshot = mergeTaskSnapshots([old, newest], [task({ id: "same", revision: 4 }), task({ id: "same", revision: 3 })]);
    expect(snapshot.map((item) => item.id)).toEqual(["same"]);
    expect(snapshot[0].revision).toBe(5);
  });

  it("refreshes only the exact initiating storage location", () => {
    const completed = task({ status: "partial", mutationCount: 2 });
    expect(taskMatchesCurrentLocation(completed, root, "docs/")).toBe(true);
    expect(taskMatchesCurrentLocation(completed, root, "other")).toBe(false);
    expect(taskMatchesCurrentLocation(completed, { ...root, id: "other" }, "docs")).toBe(false);
  });

  it("classifies active and terminal operation states", () => {
    expect(isActiveTask(task({ status: "pending" }))).toBe(true);
    expect(isActiveTask(task({ status: "blocked" }))).toBe(false);
    expect(isTerminalTask(task({ status: "partial" }))).toBe(true);
    expect(isTerminalTask(task({ status: "canceled" }))).toBe(true);
  });

  it("backs polling off from immediate feedback to steady updates", () => {
    expect(taskPollDelay(100)).toBe(50);
    expect(taskPollDelay(2000)).toBe(300);
    expect(taskPollDelay(10000)).toBe(1000);
    expect(taskPollDelay(60000)).toBe(2000);
  });

  it("uses operation-specific labels with a safe fallback", () => {
    expect(["copy", "move", "delete", "download", "upload"].map(taskOperationLabel)).toEqual([
      "Copy",
      "Move",
      "Delete",
      "Download",
      "Upload"
    ]);
    expect(taskOperationLabel("custom")).toBe("Task");
  });

  it("bounds parallel browser item delivery", async () => {
    let active = 0;
    let maximum = 0;
    const completed: number[] = [];

    await runWithConcurrency([0, 1, 2, 3, 4, 5, 6], 3, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      completed.push(value);
      active -= 1;
    });

    expect(maximum).toBe(3);
    expect(completed.sort((left, right) => left - right)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("calls paginated and cancellation task routes", async () => {
    const fetchMock = mockJSONFetch({ items: [], totalCount: 0 });
    await cagnardApi.taskItems("task/one", "next page", 50);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task%2Fone/items?pageSize=50&pageRef=next+page",
      expect.objectContaining({ credentials: "same-origin" })
    );

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(jsonResponse(task({ status: "canceled" })));
    await cagnardApi.cancelTask("task/one");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task%2Fone/cancel",
      expect.objectContaining({ method: "POST", credentials: "same-origin" })
    );
  });

  it("streams the original upload body with its abort signal", async () => {
    const fetchMock = mockJSONFetch({ taskId: "upload-1", itemId: "item-1", status: "completed", message: "Uploaded" });
    const body = new Blob(["streamed payload"], { type: "text/plain" });
    const controller = new AbortController();

    await cagnardApi.uploadTaskItem("upload-1", "item-1", body, "text/plain", controller.signal);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init).toMatchObject({ method: "PUT", body, signal: controller.signal });
    expect(init.headers).toEqual({ "Content-Type": "text/plain" });
  });
});

function mockJSONFetch(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body)
  } as Response;
}
