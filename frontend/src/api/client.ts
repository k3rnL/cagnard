import type {
  EntryListResponse,
  NavigationResponse,
  OperationResponse,
  PreviewResponse,
  SessionResponse,
  UiPluginsResponse
} from "./types";

const defaultHeaders = {
  "X-Cagnard-User": "alice"
};

interface ApiResponseBody {
  message?: string;
  [key: string]: unknown;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...defaultHeaders,
      ...(init?.headers ?? {})
    }
  });
  const body = await parseOptionalJson(response);

  if (!response.ok) {
    const message = body?.message ?? `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

async function parseOptionalJson(response: Response): Promise<ApiResponseBody | undefined> {
  const text = await response.text();
  if (!text.trim()) return undefined;

  try {
    const parsed = JSON.parse(text) as ApiResponseBody;
    return typeof parsed.message === "string" ? parsed : { ...parsed, message: undefined };
  } catch {
    return { message: text };
  }
}

function storageParams(tunnel: string, rootId: string, path = "", extra?: Record<string, string>) {
  return new URLSearchParams({ tunnel, rootId, path, ...(extra ?? {}) });
}

function operation<T extends Record<string, unknown>>(url: string, body: T) {
  return fetchJson<OperationResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export const cagnardApi = {
  session: () => fetchJson<SessionResponse>("/api/session"),
  navigation: () => fetchJson<NavigationResponse>("/api/storage/navigation"),
  entries: (tunnel: string, rootId: string, path = "") =>
    fetchJson<EntryListResponse>(
      `/api/storage/entries?${storageParams(tunnel, rootId, path)}`
    ),
  preview: (tunnel: string, rootId: string, path: string) =>
    fetchJson<PreviewResponse>(`/api/storage/preview?${storageParams(tunnel, rootId, path)}`),
  upload: (tunnel: string, rootId: string, path: string, file: File, overwrite = false) =>
    fetchJson<OperationResponse>(`/api/storage/content?${storageParams(tunnel, rootId, path, { overwrite: String(overwrite) })}`, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file
    }),
  download: async (tunnel: string, rootId: string, path: string) => {
    const response = await fetch(`/api/storage/content?${storageParams(tunnel, rootId, path)}`, {
      headers: defaultHeaders
    });
    if (!response.ok) {
      const body = await parseOptionalJson(response);
      throw new Error(body?.message ?? `Download failed with ${response.status}`);
    }
    return response.blob();
  },
  createFolder: (tunnel: string, rootId: string, parentPath: string, name: string) =>
    operation("/api/storage/folders", { tunnel, rootId, parentPath, name }),
  rename: (tunnel: string, rootId: string, path: string, newName: string) =>
    operation("/api/storage/rename", { tunnel, rootId, path, newName }),
  delete: (tunnel: string, rootId: string, path: string, confirmed: boolean) =>
    operation("/api/storage/delete", { tunnel, rootId, path, confirmed }),
  copy: (tunnel: string, rootId: string, sourcePath: string, targetPath: string, overwrite = false) =>
    operation("/api/storage/copy", { tunnel, rootId, sourcePath, targetPath, overwrite }),
  move: (tunnel: string, rootId: string, sourcePath: string, targetPath: string, overwrite = false) =>
    operation("/api/storage/move", { tunnel, rootId, sourcePath, targetPath, overwrite }),
  uiPlugins: () => fetchJson<UiPluginsResponse>("/api/plugins/ui")
};
