package storage

func FilesystemCapabilities(readOnly bool) []CapabilityStatus {
	description := func(value string) *string { return &value }
	common := []CapabilityStatus{
		{Name: "list", Status: "supported", Description: description("List children for a storage location")},
		{Name: "recursive-list", Status: "supported", Description: description("List directory trees for recursive transfer planning")},
		{Name: "stat", Status: "supported", Description: description("Read normalized metadata for a storage entry")},
		{Name: "open", Status: "supported", Description: description("Open file content through a compatible file opener")},
		{Name: "download", Status: "supported", Description: description("Read file content from the provider")},
		{Name: "full-read", Status: "supported", Description: description("Read complete file content when size limits allow it")},
		{Name: "bounded-read", Status: "supported", Description: description("Read bounded content for previews and text openers")},
		{Name: "range-read", Status: "supported", Description: description("Read byte ranges of file content for seeking and partial opening")},
		{Name: "stream-read", Status: "supported", Description: description("Stream file content without loading the whole file into memory")},
		{Name: "stream-write", Status: "supported", Description: description("Write file content from a stream")},
		{Name: "multipart-upload", Status: "planned", Description: description("Multipart upload is not implemented yet")},
		{Name: "verify-write", Status: "supported", Description: description("Verify destination writes through provider stat or metadata")},
		{Name: "preview", Status: "supported", Description: description("Legacy bounded text preview API remains available for text openers")},
		{Name: "content-search", Status: "supported", Description: description("Search within a single file's text content")},
		{Name: "watch", Status: "supported", Description: description("Watch a file for changes through native filesystem events")},
		{Name: "search", Status: "degraded", Description: description("Search can fall back to scoped listing in a later implementation")},
		{Name: "transfer", Status: "supported", Description: description("Participate in provider-neutral pasteboard transfer")},
	}
	mutations := []CapabilityStatus{
		{Name: "upload", Status: "supported", Description: description("Write file content to the provider")},
		{Name: "overwrite", Status: "supported", Description: description("Replace existing file content when write policy allows it")},
		{Name: "create-folder", Status: "supported", Description: description("Create a directory in the provider")},
		{Name: "rename", Status: "supported", Description: description("Rename a file or directory")},
		{Name: "copy", Status: "supported", Description: description("Copy a file inside the storage root")},
		{Name: "move", Status: "supported", Description: description("Move a file or directory inside the storage root")},
		{Name: "delete", Status: "supported", Description: description("Delete a file or directory tree")},
	}
	if readOnly {
		for idx := range mutations {
			mutations[idx].Status = "unsupported"
			mutations[idx].Description = description(mutations[idx].Name + " is disabled for read-only roots")
		}
	}
	return append(common, mutations...)
}

func GenericCapabilities(providerType string, readOnly bool) []CapabilityStatus {
	if providerType == "filesystem" {
		return FilesystemCapabilities(readOnly)
	}
	if providerType == "http" {
		return HTTPCapabilities()
	}
	if providerType == "s3" {
		return S3Capabilities(readOnly, false)
	}
	return S3Capabilities(readOnly, false)
}

// HTTPCapabilities describes the read-only http provider: listings and stat
// resolve from a fetched manifest, content reads go over HTTP range requests,
// and every mutation is structurally unsupported.
func HTTPCapabilities() []CapabilityStatus {
	description := func(value string) *string { return &value }
	common := []CapabilityStatus{
		{Name: "list", Status: "supported", Description: description("List children for a storage location from the manifest")},
		{Name: "recursive-list", Status: "supported", Description: description("List directory trees for recursive transfer planning")},
		{Name: "stat", Status: "supported", Description: description("Read normalized metadata for a storage entry")},
		{Name: "open", Status: "supported", Description: description("Open file content through a compatible file opener")},
		{Name: "download", Status: "supported", Description: description("Read file content from the HTTP origin")},
		{Name: "full-read", Status: "supported", Description: description("Read complete file content when size limits allow it")},
		{Name: "bounded-read", Status: "supported", Description: description("Read bounded content for previews and text openers")},
		{Name: "range-read", Status: "supported", Description: description("Read byte ranges of file content through HTTP range requests")},
		{Name: "stream-read", Status: "supported", Description: description("Stream file content without loading the whole file into memory")},
		{Name: "stream-write", Status: "unsupported", Description: description("stream-write is unavailable on the read-only http provider")},
		{Name: "multipart-upload", Status: "unsupported", Description: description("multipart-upload is unavailable on the read-only http provider")},
		{Name: "verify-write", Status: "unsupported", Description: description("verify-write is unavailable on the read-only http provider")},
		{Name: "preview", Status: "supported", Description: description("Legacy bounded text preview API remains available for text openers")},
		{Name: "content-search", Status: "supported", Description: description("Search within a single file's text content")},
		{Name: "watch", Status: "unsupported", Description: description("watch is unavailable on static HTTP origins")},
		{Name: "search", Status: "degraded", Description: description("Search can fall back to scoped listing in a later implementation")},
		{Name: "transfer", Status: "supported", Description: description("Participate in provider-neutral pasteboard transfer as a source")},
	}
	mutations := []string{"upload", "overwrite", "create-folder", "rename", "copy", "move", "delete"}
	for _, name := range mutations {
		common = append(common, CapabilityStatus{
			Name:        name,
			Status:      "unsupported",
			Description: description(name + " is unavailable on the read-only http provider"),
		})
	}
	return common
}

func S3Capabilities(readOnly bool, directory bool) []CapabilityStatus {
	description := func(value string) *string { return &value }
	common := []CapabilityStatus{
		{Name: "list", Status: "supported", Description: description("List children for a storage location")},
		{Name: "recursive-list", Status: "supported", Description: description("List directory trees for recursive transfer planning")},
		{Name: "stat", Status: "supported", Description: description("Read normalized metadata for a storage entry")},
		{Name: "open", Status: "supported", Description: description("Open file content through a compatible file opener")},
		{Name: "download", Status: "supported", Description: description("Read file content from the provider")},
		{Name: "full-read", Status: "supported", Description: description("Read complete file content when size limits allow it")},
		{Name: "bounded-read", Status: "supported", Description: description("Read bounded content for previews and text openers")},
		{Name: "range-read", Status: "supported", Description: description("Read byte ranges of S3 object content for seeking and partial opening")},
		{Name: "stream-read", Status: "supported", Description: description("Stream S3 object content without loading the whole object into memory")},
		{Name: "stream-write", Status: "supported", Description: description("Write S3 object content from a stream")},
		{Name: "multipart-upload", Status: "planned", Description: description("Multipart upload is not implemented yet")},
		{Name: "verify-write", Status: "supported", Description: description("Verify destination writes through provider stat or metadata")},
		{Name: "preview", Status: "supported", Description: description("Legacy bounded text preview API remains available for text openers")},
		{Name: "content-search", Status: "supported", Description: description("Search within a single file's text content")},
		{Name: "watch", Status: "degraded", Description: description("Watch an S3 object for changes through backend-side polling")},
		{Name: "search", Status: "degraded", Description: description("Search can fall back to scoped listing in a later implementation")},
		{Name: "transfer", Status: "supported", Description: description("Participate in provider-neutral pasteboard transfer")},
	}
	objectRename := CapabilityStatus{Name: "rename", Status: "degraded", Description: description("S3 rename is implemented as copy then delete for objects")}
	objectMove := CapabilityStatus{Name: "move", Status: "degraded", Description: description("S3 move is implemented as copy then delete for objects")}
	objectDelete := CapabilityStatus{Name: "delete", Status: "supported", Description: description("Delete S3 objects or directory-like prefixes recursively")}
	mutations := []CapabilityStatus{
		{Name: "upload", Status: "supported", Description: description("Write file content to the provider")},
		{Name: "overwrite", Status: "supported", Description: description("Replace existing file content when write policy allows it")},
		{Name: "create-folder", Status: "supported", Description: description("Create a directory in the provider")},
		objectRename,
		{Name: "copy", Status: "supported", Description: description("Copy a file inside the storage root")},
		objectMove,
		objectDelete,
	}
	if directory {
		unsupported := description("Recursive prefix mutation is not implemented for S3 directory-like entries")
		mutations = []CapabilityStatus{
			{Name: "upload", Status: "supported", Description: description("Write file content to the provider")},
			{Name: "overwrite", Status: "unsupported", Description: unsupported},
			{Name: "create-folder", Status: "supported", Description: description("Create a directory in the provider")},
			{Name: "rename", Status: "unsupported", Description: unsupported},
			{Name: "copy", Status: "unsupported", Description: unsupported},
			{Name: "move", Status: "unsupported", Description: unsupported},
			objectDelete,
		}
	}
	if readOnly {
		for idx := range mutations {
			mutations[idx].Status = "unsupported"
		}
	}
	return append(common, mutations...)
}
