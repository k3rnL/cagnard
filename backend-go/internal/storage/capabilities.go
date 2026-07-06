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
		{Name: "range-read", Status: "planned", Description: description("Byte-range file opening is not implemented yet")},
		{Name: "stream-read", Status: "supported", Description: description("Stream file content without loading the whole file into memory")},
		{Name: "stream-write", Status: "supported", Description: description("Write file content from a stream")},
		{Name: "multipart-upload", Status: "planned", Description: description("Multipart upload is not implemented yet")},
		{Name: "verify-write", Status: "supported", Description: description("Verify destination writes through provider stat or metadata")},
		{Name: "preview", Status: "supported", Description: description("Legacy bounded text preview API remains available for text openers")},
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
	if providerType == "s3" {
		return S3Capabilities(readOnly, false)
	}
	return S3Capabilities(readOnly, false)
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
		{Name: "range-read", Status: "planned", Description: description("Byte-range file opening is not implemented yet")},
		{Name: "stream-read", Status: "planned", Description: description("Streaming file opening is not implemented yet")},
		{Name: "stream-write", Status: "planned", Description: description("Streaming file writes are not implemented yet")},
		{Name: "multipart-upload", Status: "planned", Description: description("Multipart upload is not implemented yet")},
		{Name: "verify-write", Status: "supported", Description: description("Verify destination writes through provider stat or metadata")},
		{Name: "preview", Status: "supported", Description: description("Legacy bounded text preview API remains available for text openers")},
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
