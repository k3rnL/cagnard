export interface ApiError {
  code: string;
  message: string;
}

export interface AppearanceResponse {
  defaultPalette: "classic" | "solar";
  defaultMode: "light" | "dark" | "system";
  allowUserOverride: boolean;
}

export interface UserProfile {
  id: string;
  displayName: string;
  roles: string[];
  groups: string[];
  claims: Record<string, string>;
}

export interface SessionResponse {
  user: UserProfile;
  authMode: string;
  personalEnabled: boolean;
  globalEnabled: boolean;
}

export interface AuthProviderField {
  name: string;
  label: string;
  kind: "text" | "password" | string;
  required: boolean;
}

export interface AuthProviderMetadata {
  id: string;
  label: string;
  kind: "static" | "oidc" | string;
  loginUrl?: string;
  fields: AuthProviderField[];
  capabilities: string[];
}

export interface AuthProvidersResponse {
  providers: AuthProviderMetadata[];
}

export interface LoginResponse {
  session: SessionResponse;
}

export interface LogoutResponse {
  success: boolean;
}

export interface CapabilityStatus {
  name: string;
  status: "supported" | "unsupported" | "degraded" | "planned" | string;
  description?: string;
}

export interface NavigationRoot {
  id: string;
  label: string;
  tunnel: "personal" | "global";
  providerId: string;
  accountId: string;
  providerFamily: string;
  readOnly: boolean;
  capabilities: CapabilityStatus[];
}

export interface NavigationSection {
  label: string;
  roots: NavigationRoot[];
}

export interface NavigationResponse {
  personal?: NavigationSection;
  global?: NavigationSection;
}

export interface EntryMetadata {
  size?: number | null;
  mimeType?: string | null;
  owner?: string | null;
  permissions?: string | null;
  modifiedTime?: string | null;
  version?: string | null;
  retention?: string | null;
  encryption?: string | null;
  unavailable: string[];
  fileCategory?: string | null;
  fileIcon?: string | null;
  mimeTypeSource?: string | null;
}

export interface StorageEntry {
  id: string;
  name: string;
  path: string;
  kind: "directory" | "file" | "other" | string;
  metadata: EntryMetadata;
  capabilities: CapabilityStatus[];
  providerSpecific: Record<string, string>;
}

export interface EntryListResponse {
  root: NavigationRoot;
  path: string;
  entries: StorageEntry[];
  page: EntryListPage;
}

export interface EntryListPage {
  pageSize: number;
  nextPageRef?: string | null;
  totalCount?: number | null;
  filteredCount?: number | null;
  hasMore: boolean;
  query: string;
  sortKey: string;
  sortDirection: string;
  accuracy: EntryListAccuracy;
}

export interface EntryListAccuracy {
  search: string;
  sort: string;
  total: string;
}

export interface OperationResponse {
  success: boolean;
  message: string;
  entry?: StorageEntry;
}

export type TransferIntent = "copy" | "move";
export type TransferConflictPolicy = "fail" | "skip" | "keep-both" | "replace";

export interface TransferSourceRequest {
  intent: TransferIntent;
  tunnel: "personal" | "global";
  rootId: string;
  path: string;
}

export interface TransferDestinationRequest {
  tunnel: "personal" | "global";
  rootId: string;
  path: string;
}

export interface TransferRequest {
  sources: TransferSourceRequest[];
  destination: TransferDestinationRequest;
  conflictPolicy: TransferConflictPolicy;
}

export interface ResolveTransferJobRequest {
  conflictPolicy: TransferConflictPolicy;
}

export interface TransferItemResult {
  intent: TransferIntent;
  sourceTunnel: string;
  sourceRootId: string;
  sourcePath: string;
  targetPath?: string;
  status: "copied" | "moved" | "skipped" | "conflict" | "failed" | "partial" | string;
  message: string;
  entry?: StorageEntry;
  children: TransferItemResult[];
}

export interface TransferResponse {
  success: boolean;
  message: string;
  results: TransferItemResult[];
}

export interface TransferTaskProgress {
  bytesTransferred: number;
  totalBytes?: number | null;
  itemsCompleted: number;
  totalItems?: number | null;
}

export interface TransferJobTask {
  id: string;
  intent: TransferIntent;
  sourceTunnel: string;
  sourceRootId: string;
  sourcePath: string;
  targetPath?: string;
  phase: string;
  status: string;
  message: string;
  progress: TransferTaskProgress;
  result?: TransferItemResult;
  children: TransferJobTask[];
}

export interface TransferJobResponse {
  id: string;
  status: "pending" | "blocked" | "canceled" | "running" | "completed" | "error" | string;
  message: string;
  createdAt: string;
  updatedAt: string;
  operation: TransferIntent | "mixed" | string;
  destination: TransferDestinationRequest;
  conflictPolicy: TransferConflictPolicy;
  tasks: TransferJobTask[];
  results: TransferItemResult[];
}

export interface TransferJobListResponse {
  jobs: TransferJobResponse[];
}

export interface PreviewResponse {
  path: string;
  mimeType?: string;
  content: string;
  truncated: boolean;
  offset: number;
  nextOffset: number;
  size?: number | null;
}

export interface ArchiveEntry {
  path: string;
  name: string;
  kind: string;
  size?: number | null;
}

export interface ArchiveEntriesResponse {
  path: string;
  entryPath?: string;
  entries: ArchiveEntry[];
}

export interface ContentSearchMatch {
  line: number;
  offset: number;
  text: string;
}

export interface ContentSearchResponse {
  path: string;
  matches: ContentSearchMatch[];
  more: boolean;
  nextOffset: number;
  nextLine: number;
}
