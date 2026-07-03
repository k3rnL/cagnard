import type {
  AuthProvidersResponse,
  EntryListResponse,
  LoginResponse,
  NavigationResponse,
  OperationResponse,
  PreviewResponse,
  SessionResponse,
  UiPluginsResponse
} from "./types";

interface ApiResponseBody {
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.headers ?? {})
    }
  });
  const body = await parseOptionalJson(response);

  if (!response.ok) {
    const message = body?.message ?? `Request failed with ${response.status}`;
    throw new ApiRequestError(message, response.status, body?.code);
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
  authProviders: () => fetchJson<AuthProvidersResponse>("/api/auth/providers"),
  login: (providerId: string, username: string, password: string) =>
    fetchJson<LoginResponse>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId, username, password })
    }),
  logout: () =>
    fetchJson<{ success: boolean }>("/api/auth/logout", {
      method: "POST"
    }),
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
      credentials: "same-origin"
    });
    if (!response.ok) {
      const body = await parseOptionalJson(response);
      throw new ApiRequestError(body?.message ?? `Download failed with ${response.status}`, response.status, body?.code);
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
