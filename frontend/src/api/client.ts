import type {
  ArchiveEntriesResponse,
  AuthProvidersResponse,
  ContentSearchResponse,
  EntryListResponse,
  LoginResponse,
  NavigationResponse,
  OperationResponse,
  PreviewResponse,
  SessionResponse,
  StorageEntry,
  TransferRequest,
  ResolveTransferJobRequest,
  TransferJobListResponse,
  TransferJobResponse,
  TransferResponse,
  UiPluginsResponse
} from "./types";

interface ApiResponseBody {
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export interface EntryListOptions {
  pageSize?: number;
  pageRef?: string;
  query?: string;
  sortKey?: string;
  sortDirection?: string;
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

function storageParams(tunnel: string, rootId: string, path = "", extra?: Record<string, string | undefined>) {
  const params = new URLSearchParams({ tunnel, rootId, path });
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value !== undefined) params.set(key, value);
  }
  return params;
}

function entryListParams(tunnel: string, rootId: string, path = "", options: EntryListOptions = {}) {
  const params = storageParams(tunnel, rootId, path);
  if (options.pageSize !== undefined) params.set("pageSize", String(options.pageSize));
  if (options.pageRef) params.set("pageRef", options.pageRef);
  if (options.query?.trim()) params.set("query", options.query.trim());
  if (options.sortKey) params.set("sortKey", options.sortKey);
  if (options.sortDirection) params.set("sortDirection", options.sortDirection);
  return params;
}

function operation<T extends Record<string, unknown>>(url: string, body: T) {
  return fetchJson<OperationResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function putStorageContent(tunnel: string, rootId: string, path: string, body: BodyInit, contentType: string, overwrite = false) {
  return fetchJson<OperationResponse>(`/api/storage/content?${storageParams(tunnel, rootId, path, { overwrite: String(overwrite) })}`, {
    method: "PUT",
    headers: { "Content-Type": contentType || "application/octet-stream" },
    body
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
  entries: (tunnel: string, rootId: string, path = "", options?: EntryListOptions) =>
    fetchJson<EntryListResponse>(
      `/api/storage/entries?${entryListParams(tunnel, rootId, path, options)}`
    ),
  stat: (tunnel: string, rootId: string, path: string) =>
    fetchJson<StorageEntry>(`/api/storage/stat?${storageParams(tunnel, rootId, path)}`),
  preview: (tunnel: string, rootId: string, path: string, offset = 0) =>
    fetchJson<PreviewResponse>(
      `/api/storage/preview?${storageParams(tunnel, rootId, path, offset > 0 ? { offset: String(offset) } : undefined)}`
    ),
  contentSearch: (
    tunnel: string,
    rootId: string,
    path: string,
    query: string,
    options: { regex?: boolean; caseSensitive?: boolean; fromOffset?: number; fromLine?: number } = {}
  ) =>
    fetchJson<ContentSearchResponse>(
      `/api/storage/content/search?${storageParams(tunnel, rootId, path, {
        query,
        regex: options.regex ? "true" : undefined,
        caseSensitive: options.caseSensitive ? "true" : undefined,
        fromOffset: options.fromOffset ? String(options.fromOffset) : undefined,
        fromLine: options.fromLine ? String(options.fromLine) : undefined
      })}`
    ),
  contentUrl: (tunnel: string, rootId: string, path: string) =>
    `/api/storage/content?${storageParams(tunnel, rootId, path, { inline: "true" })}`,
  archiveEntries: (tunnel: string, rootId: string, path: string, entryPath?: string) =>
    fetchJson<ArchiveEntriesResponse>(
      `/api/storage/archive/entries?${storageParams(tunnel, rootId, path, { entryPath: entryPath || undefined })}`
    ),
  archiveEntryUrl: (tunnel: string, rootId: string, path: string, entryPath: string) =>
    `/api/storage/archive/entry?${storageParams(tunnel, rootId, path, { entryPath })}`,
  archiveEntryText: async (tunnel: string, rootId: string, path: string, entryPath: string) => {
    const response = await fetch(`/api/storage/archive/entry?${storageParams(tunnel, rootId, path, { entryPath })}`, {
      credentials: "same-origin"
    });
    if (!response.ok) {
      const body = await parseOptionalJson(response);
      throw new ApiRequestError(body?.message ?? `Archive read failed with ${response.status}`, response.status, body?.code);
    }
    return response.text();
  },
  upload: (tunnel: string, rootId: string, path: string, file: File, overwrite = false) =>
    putStorageContent(tunnel, rootId, path, file, file.type || "application/octet-stream", overwrite),
  uploadContent: putStorageContent,
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
  transfer: (request: TransferRequest) =>
    fetchJson<TransferResponse>("/api/storage/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    }),
  startTransferJob: (request: TransferRequest) =>
    fetchJson<TransferJobResponse>("/api/storage/transfer/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    }),
  transferJobs: () => fetchJson<TransferJobListResponse>("/api/storage/transfer/jobs"),
  transferJob: (jobId: string) => fetchJson<TransferJobResponse>(`/api/storage/transfer/jobs/${encodeURIComponent(jobId)}`),
  resolveTransferJob: (jobId: string, request: ResolveTransferJobRequest) =>
    fetchJson<TransferJobResponse>(`/api/storage/transfer/jobs/${encodeURIComponent(jobId)}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    }),
  cancelTransferJob: (jobId: string) =>
    fetchJson<TransferJobResponse>(`/api/storage/transfer/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST"
    }),
  clearTransferJobs: () =>
    fetchJson<OperationResponse>("/api/storage/transfer/jobs/clear", {
      method: "POST"
    }),
  uiPlugins: () => fetchJson<UiPluginsResponse>("/api/plugins/ui")
};
