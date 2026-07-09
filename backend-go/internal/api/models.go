package api

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type HealthResponse struct {
	Status          string `json:"status"`
	Stateless       bool   `json:"stateless"`
	Providers       int    `json:"providers"`
	ConfiguredUsers int    `json:"configuredUsers"`
}

type UserProfile struct {
	ID          string            `json:"id"`
	DisplayName string            `json:"displayName"`
	Roles       []string          `json:"roles"`
	Groups      []string          `json:"groups"`
	Claims      map[string]string `json:"claims"`
}

type SessionResponse struct {
	User            UserProfile `json:"user"`
	AuthMode        string      `json:"authMode"`
	PersonalEnabled bool        `json:"personalEnabled"`
	GlobalEnabled   bool        `json:"globalEnabled"`
}

type AuthProvidersResponse struct {
	Providers []AuthProviderMetadata `json:"providers"`
}

type LoginRequest struct {
	ProviderID string  `json:"providerId"`
	Username   *string `json:"username"`
	Password   *string `json:"password"`
}

type LoginResponse struct {
	Session SessionResponse `json:"session"`
}

type LogoutResponse struct {
	Success bool `json:"success"`
}

type AuthProviderMetadata struct {
	ID           string              `json:"id"`
	Label        string              `json:"label"`
	Kind         string              `json:"kind"`
	LoginURL     *string             `json:"loginUrl"`
	Fields       []AuthProviderField `json:"fields"`
	Capabilities []string            `json:"capabilities"`
}

type AuthProviderField struct {
	Name     string `json:"name"`
	Label    string `json:"label"`
	Kind     string `json:"kind"`
	Required bool   `json:"required"`
}

type CapabilityStatus struct {
	Name        string  `json:"name"`
	Status      string  `json:"status"`
	Description *string `json:"description"`
}

type NavigationRoot struct {
	ID             string             `json:"id"`
	Label          string             `json:"label"`
	Tunnel         string             `json:"tunnel"`
	ProviderID     string             `json:"providerId"`
	AccountID      string             `json:"accountId"`
	ProviderFamily string             `json:"providerFamily"`
	ReadOnly       bool               `json:"readOnly"`
	Capabilities   []CapabilityStatus `json:"capabilities"`
}

type NavigationSection struct {
	Label string           `json:"label"`
	Roots []NavigationRoot `json:"roots"`
}

type NavigationResponse struct {
	Personal *NavigationSection `json:"personal"`
	Global   *NavigationSection `json:"global"`
}

type EntryMetadata struct {
	Size           *int64   `json:"size"`
	MIMEType       *string  `json:"mimeType"`
	Owner          *string  `json:"owner"`
	Permissions    *string  `json:"permissions"`
	ModifiedTime   *string  `json:"modifiedTime"`
	Version        *string  `json:"version"`
	Retention      *string  `json:"retention"`
	Encryption     *string  `json:"encryption"`
	Unavailable    []string `json:"unavailable"`
	FileCategory   *string  `json:"fileCategory"`
	FileIcon       *string  `json:"fileIcon"`
	MIMETypeSource *string  `json:"mimeTypeSource"`
}

type StorageEntry struct {
	ID               string             `json:"id"`
	Name             string             `json:"name"`
	Path             string             `json:"path"`
	Kind             string             `json:"kind"`
	Metadata         EntryMetadata      `json:"metadata"`
	Capabilities     []CapabilityStatus `json:"capabilities"`
	ProviderSpecific map[string]string  `json:"providerSpecific"`
}

type EntryListResponse struct {
	Root    NavigationRoot `json:"root"`
	Path    string         `json:"path"`
	Entries []StorageEntry `json:"entries"`
	Page    EntryListPage  `json:"page"`
}

type EntryListPage struct {
	PageSize      int               `json:"pageSize"`
	NextPageRef   *string           `json:"nextPageRef"`
	TotalCount    *int              `json:"totalCount"`
	FilteredCount *int              `json:"filteredCount"`
	HasMore       bool              `json:"hasMore"`
	Query         string            `json:"query"`
	SortKey       string            `json:"sortKey"`
	SortDirection string            `json:"sortDirection"`
	Accuracy      EntryListAccuracy `json:"accuracy"`
}

type EntryListAccuracy struct {
	Search string `json:"search"`
	Sort   string `json:"sort"`
	Total  string `json:"total"`
}

type OperationResponse struct {
	Success bool          `json:"success"`
	Message string        `json:"message"`
	Entry   *StorageEntry `json:"entry"`
}

type PreviewResponse struct {
	Path       string  `json:"path"`
	MIMEType   *string `json:"mimeType"`
	Content    string  `json:"content"`
	Truncated  bool    `json:"truncated"`
	Offset     int64   `json:"offset"`
	NextOffset int64   `json:"nextOffset"`
	Size       *int64  `json:"size"`
}

type ContentSearchMatch struct {
	Line   int64  `json:"line"`
	Offset int64  `json:"offset"`
	Text   string `json:"text"`
}

type ContentSearchResponse struct {
	Path       string               `json:"path"`
	Matches    []ContentSearchMatch `json:"matches"`
	More       bool                 `json:"more"`
	NextOffset int64                `json:"nextOffset"`
	NextLine   int64                `json:"nextLine"`
}

type ArchiveEntryResponse struct {
	Path string `json:"path"`
	Name string `json:"name"`
	Kind string `json:"kind"`
	Size *int64 `json:"size"`
}

type ArchiveEntriesResponse struct {
	Path      string                 `json:"path"`
	EntryPath string                 `json:"entryPath,omitempty"`
	Entries   []ArchiveEntryResponse `json:"entries"`
}

type CreateFolderRequest struct {
	Tunnel     string `json:"tunnel"`
	RootID     string `json:"rootId"`
	ParentPath string `json:"parentPath"`
	Name       string `json:"name"`
}

type RenameEntryRequest struct {
	Tunnel  string `json:"tunnel"`
	RootID  string `json:"rootId"`
	Path    string `json:"path"`
	NewName string `json:"newName"`
}

type DeleteEntryRequest struct {
	Tunnel    string `json:"tunnel"`
	RootID    string `json:"rootId"`
	Path      string `json:"path"`
	Confirmed bool   `json:"confirmed"`
}

type CopyEntryRequest struct {
	Tunnel     string `json:"tunnel"`
	RootID     string `json:"rootId"`
	SourcePath string `json:"sourcePath"`
	TargetPath string `json:"targetPath"`
	Overwrite  bool   `json:"overwrite"`
}

type MoveEntryRequest struct {
	Tunnel     string `json:"tunnel"`
	RootID     string `json:"rootId"`
	SourcePath string `json:"sourcePath"`
	TargetPath string `json:"targetPath"`
	Overwrite  bool   `json:"overwrite"`
}

type TransferSourceRequest struct {
	Intent string `json:"intent"`
	Tunnel string `json:"tunnel"`
	RootID string `json:"rootId"`
	Path   string `json:"path"`
}

type TransferDestinationRequest struct {
	Tunnel string `json:"tunnel"`
	RootID string `json:"rootId"`
	Path   string `json:"path"`
}

type TransferRequest struct {
	Sources        []TransferSourceRequest    `json:"sources"`
	Destination    TransferDestinationRequest `json:"destination"`
	ConflictPolicy string                     `json:"conflictPolicy"`
}

type ResolveTransferJobRequest struct {
	ConflictPolicy string `json:"conflictPolicy"`
}

type TransferItemResult struct {
	Intent       string               `json:"intent"`
	SourceTunnel string               `json:"sourceTunnel"`
	SourceRootID string               `json:"sourceRootId"`
	SourcePath   string               `json:"sourcePath"`
	TargetPath   *string              `json:"targetPath"`
	Status       string               `json:"status"`
	Message      string               `json:"message"`
	Entry        *StorageEntry        `json:"entry"`
	Children     []TransferItemResult `json:"children"`
}

type TransferResponse struct {
	Success bool                 `json:"success"`
	Message string               `json:"message"`
	Results []TransferItemResult `json:"results"`
}

type TransferTaskProgress struct {
	BytesTransferred int64  `json:"bytesTransferred"`
	TotalBytes       *int64 `json:"totalBytes"`
	ItemsCompleted   int    `json:"itemsCompleted"`
	TotalItems       *int   `json:"totalItems"`
}

type TransferJobTask struct {
	ID           string               `json:"id"`
	Intent       string               `json:"intent"`
	SourceTunnel string               `json:"sourceTunnel"`
	SourceRootID string               `json:"sourceRootId"`
	SourcePath   string               `json:"sourcePath"`
	TargetPath   *string              `json:"targetPath"`
	Phase        string               `json:"phase"`
	Status       string               `json:"status"`
	Message      string               `json:"message"`
	Progress     TransferTaskProgress `json:"progress"`
	Result       *TransferItemResult  `json:"result"`
	Children     []TransferJobTask    `json:"children"`
}

type TransferJobResponse struct {
	ID             string                     `json:"id"`
	Status         string                     `json:"status"`
	Message        string                     `json:"message"`
	CreatedAt      string                     `json:"createdAt"`
	UpdatedAt      string                     `json:"updatedAt"`
	Operation      string                     `json:"operation"`
	Destination    TransferDestinationRequest `json:"destination"`
	ConflictPolicy string                     `json:"conflictPolicy"`
	Tasks          []TransferJobTask          `json:"tasks"`
	Results        []TransferItemResult       `json:"results"`
}

type TransferJobListResponse struct {
	Jobs []TransferJobResponse `json:"jobs"`
}

type UIPluginsResponse struct {
	Plugins []UIPluginManifest `json:"plugins"`
}

type UIPluginManifest struct {
	ID                   string   `json:"id"`
	Label                string   `json:"label"`
	Kind                 string   `json:"kind"`
	APIVersion           string   `json:"apiVersion"`
	MIMETypes            []string `json:"mimeTypes"`
	Extensions           []string `json:"extensions"`
	Permissions          []string `json:"permissions"`
	Priority             int      `json:"priority"`
	View                 string   `json:"view,omitempty"`
	Categories           []string `json:"categories,omitempty"`
	Mode                 string   `json:"mode,omitempty"`
	EditMode             string   `json:"editMode,omitempty"`
	ReadStrategy         string   `json:"readStrategy,omitempty"`
	SaveStrategy         string   `json:"saveStrategy,omitempty"`
	MaxSizeBytes         int64    `json:"maxSizeBytes,omitempty"`
	RequiredCapabilities []string `json:"requiredCapabilities,omitempty"`
}
