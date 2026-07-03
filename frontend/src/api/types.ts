export interface ApiError {
  code: string;
  message: string;
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
}

export interface OperationResponse {
  success: boolean;
  message: string;
  entry?: StorageEntry;
}

export interface PreviewResponse {
  path: string;
  mimeType?: string;
  content: string;
  truncated: boolean;
}

export interface UiPluginManifest {
  id: string;
  label: string;
  kind: string;
  apiVersion: string;
  mimeTypes: string[];
  extensions: string[];
  permissions: string[];
  priority: number;
}

export interface UiPluginsResponse {
  plugins: UiPluginManifest[];
}
