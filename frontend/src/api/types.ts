export interface ApiError {
  code: string;
  message: string;
}

export interface AppearanceResponse {
  defaultPalette: "classic" | "solar";
  defaultMode: "light" | "dark" | "system";
  allowUserOverride: boolean;
}

export interface StructuredDataConfigResponse {
  relational: { maxIngestionBytes: number; maxIngestionRows: number };
  sql: {
    timeoutMilliseconds: number;
    maxResultRows: number;
    maxQueryCharacters: number;
  };
  worker: { maxResponseBytes: number };
  iceberg: { maxMetadataBytes: number; maxProbeEntries: number };
  netcdf: {
    maxSourceBytes: number;
    maxSliceCells: number;
    maxSliceBytes: number;
    maxProjectionRows: number;
    maxPlotCells: number;
  };
  exports: { maxRows: number; maxBytes: number };
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

export interface IcebergProbeResponse {
  status: "not-detected" | "candidate" | "supported" | "unsupported";
  message: string;
  tablePath: string;
  metadataPath?: string;
  sourceUrl?: string;
  formatVersion?: number;
  tableUuid?: string;
  currentSnapshotId?: string;
  snapshotCount: number;
}

export interface OperationResponse {
  success: boolean;
  message: string;
  entry?: StorageEntry;
}

export type TransferIntent = "copy" | "move";
export type TransferConflictPolicy = "fail" | "skip" | "keep-both" | "replace";
export type StorageTunnel = "personal" | "global";

export interface TransferSourceRequest {
  intent: TransferIntent;
  tunnel: StorageTunnel;
  rootId: string;
  path: string;
}

export interface TransferDestinationRequest {
  tunnel: StorageTunnel;
  rootId: string;
  path: string;
}

export interface TransferRequest {
  sources: TransferSourceRequest[];
  destination: TransferDestinationRequest;
  conflictPolicy: TransferConflictPolicy;
  initiatedFrom: TaskLocation;
}

export interface ResolveTaskRequest {
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

export interface TaskProgress {
  bytesTransferred: number;
  totalBytes?: number | null;
  bytesDelivered?: number;
  totalDeliveredBytes?: number | null;
  itemsCompleted: number;
  totalItems?: number | null;
}

export interface TaskItem {
  id: string;
  parentId?: string;
  depth?: number;
  name?: string;
  kind?: string;
  intent: string;
  sourceTunnel: string;
  sourceRootId: string;
  sourcePath: string;
  targetPath?: string;
  phase: string;
  status: string;
  message: string;
  progress: TaskProgress;
  result?: TransferItemResult;
  children?: TaskItem[] | null;
}

export interface TaskLocation {
  tunnel: StorageTunnel;
  rootId: string;
  path: string;
}

export interface TaskDownloadDescriptor {
  url: string;
  fileName: string;
  archive: boolean;
}

export interface TaskResponse {
  id: string;
  status: "pending" | "blocked" | "canceled" | "running" | "completed" | "error" | string;
  message: string;
  createdAt: string;
  updatedAt: string;
  operation: "copy" | "move" | "delete" | "download" | "upload" | "mixed" | string;
  revision: number;
  initiatedFrom?: TaskLocation;
  mutationCount: number;
  progress: TaskProgress;
  download?: TaskDownloadDescriptor;
  destination: TransferDestinationRequest;
  conflictPolicy: TransferConflictPolicy;
  tasks: TaskItem[];
  results?: TransferItemResult[] | null;
}

export interface TaskListResponse {
  tasks: TaskResponse[];
}

export interface TaskItemPage {
  items: TaskItem[];
  nextPageRef?: string | null;
  totalCount: number;
}

export interface TaskSourceRequest {
  tunnel: StorageTunnel;
  rootId: string;
  path: string;
}

export interface DeleteTaskRequest {
  sources: TaskSourceRequest[];
  initiatedFrom: TaskLocation;
  confirmed: boolean;
}

export interface DownloadTaskRequest {
  sources: TaskSourceRequest[];
}

export interface UploadManifestItem {
  relativePath: string;
  kind: "file" | "directory";
  size?: number;
  mimeType?: string;
}

export interface UploadTaskRequest {
  destination: TaskLocation;
  initiatedFrom: TaskLocation;
  conflictPolicy: TransferConflictPolicy;
  items: UploadManifestItem[];
}

export interface UploadItemResponse {
  taskId: string;
  itemId: string;
  status: string;
  message: string;
}

export type ResolveTransferJobRequest = ResolveTaskRequest;
export type TransferTaskProgress = TaskProgress;
export type TransferJobTask = TaskItem;
export type TransferJobResponse = TaskResponse;
export interface TransferJobListResponse { jobs: TaskResponse[]; }

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
