package io.cagnard.backend.storage

import io.cagnard.backend.api.{CapabilityStatus, EntryMetadata, StorageEntry}

import java.io.{InputStream, OutputStream}
import java.nio.file.Path

case class ResolvedStorageRoot(
    id: String,
    label: String,
    tunnel: String,
    providerId: String,
    accountId: String,
    providerFamily: String,
    readOnly: Boolean,
    target: StorageRootTarget,
    settings: Map[String, String]
)

sealed trait StorageRootTarget

case class FilesystemRootTarget(basePath: Path) extends StorageRootTarget

case class ObjectStoreRootTarget(bucket: String, prefix: String) extends StorageRootTarget

case class ProviderDescriptor(
    id: String,
    family: String,
    displayName: String,
    providerType: String
)

trait StorageProvider:
  def descriptor: ProviderDescriptor
  def capabilities(root: ResolvedStorageRoot): List[CapabilityStatus]
  def list(root: ResolvedStorageRoot, path: String): Either[String, List[StorageEntry]]
  def stat(root: ResolvedStorageRoot, path: String): Either[String, StorageEntry]
  def download(root: ResolvedStorageRoot, path: String): Either[String, FileContent]
  def preview(root: ResolvedStorageRoot, path: String, maxBytes: Long): Either[String, TextPreview]
  def upload(root: ResolvedStorageRoot, path: String, bytes: Array[Byte], overwrite: Boolean): Either[String, StorageEntry]
  def createFolder(root: ResolvedStorageRoot, parentPath: String, name: String): Either[String, StorageEntry]
  def rename(root: ResolvedStorageRoot, path: String, newName: String): Either[String, StorageEntry]
  def delete(root: ResolvedStorageRoot, path: String): Either[String, Unit]
  def copy(root: ResolvedStorageRoot, sourcePath: String, targetPath: String, overwrite: Boolean): Either[String, StorageEntry]
  def move(root: ResolvedStorageRoot, sourcePath: String, targetPath: String, overwrite: Boolean): Either[String, StorageEntry]
  def contentInfo(root: ResolvedStorageRoot, path: String): Either[String, FileContentInfo] =
    stat(root, path).map(entry => FileContentInfo(entry.name, entry.metadata.mimeType, entry.metadata.size))
  def streamRead(root: ResolvedStorageRoot, path: String, output: OutputStream, onBytes: Long => Unit): Either[String, FileContentInfo] =
    Left("Stream read is not supported")
  def streamWrite(root: ResolvedStorageRoot, path: String, input: InputStream, info: FileContentInfo, overwrite: Boolean, onBytes: Long => Unit): Either[String, StorageEntry] =
    Left("Stream write is not supported")
  def supportsStreamRead(root: ResolvedStorageRoot): Boolean =
    supports(root, "stream-read")
  def supportsStreamWrite(root: ResolvedStorageRoot): Boolean =
    supports(root, "stream-write")
  private def supports(root: ResolvedStorageRoot, capabilityName: String): Boolean =
    capabilities(root).exists(capability => capability.name == capabilityName && capability.status == "supported")

case class FileContent(fileName: String, mimeType: Option[String], bytes: Array[Byte])

case class FileContentInfo(fileName: String, mimeType: Option[String], size: Option[Long])

case class TextPreview(path: String, mimeType: Option[String], content: String, truncated: Boolean)

object StorageCapabilities:
  val list = CapabilityStatus("list", "supported", Some("List children for a storage location"))
  val recursiveList = CapabilityStatus("recursive-list", "supported", Some("List directory trees for recursive transfer planning"))
  val stat = CapabilityStatus("stat", "supported", Some("Read normalized metadata for a storage entry"))
  val open = CapabilityStatus("open", "supported", Some("Open file content through a compatible file opener"))
  val download = CapabilityStatus("download", "supported", Some("Read file content from the provider"))
  val fullRead = CapabilityStatus("full-read", "supported", Some("Read complete file content when size limits allow it"))
  val boundedRead = CapabilityStatus("bounded-read", "supported", Some("Read bounded content for previews and text openers"))
  val rangeRead = CapabilityStatus("range-read", "planned", Some("Byte-range file opening is not implemented yet"))
  val streamRead = CapabilityStatus("stream-read", "planned", Some("Streaming file opening is not implemented yet"))
  val streamWrite = CapabilityStatus("stream-write", "planned", Some("Streaming file writes are not implemented yet"))
  val multipartUpload = CapabilityStatus("multipart-upload", "planned", Some("Multipart upload is not implemented yet"))
  val verifyWrite = CapabilityStatus("verify-write", "supported", Some("Verify destination writes through provider stat or metadata"))
  val upload = CapabilityStatus("upload", "supported", Some("Write file content to the provider"))
  val overwrite = CapabilityStatus("overwrite", "supported", Some("Replace existing file content when write policy allows it"))
  val createFolder = CapabilityStatus("create-folder", "supported", Some("Create a directory in the provider"))
  val rename = CapabilityStatus("rename", "supported", Some("Rename a file or directory"))
  val copy = CapabilityStatus("copy", "supported", Some("Copy a file inside the storage root"))
  val move = CapabilityStatus("move", "supported", Some("Move a file or directory inside the storage root"))
  val transfer = CapabilityStatus("transfer", "supported", Some("Participate in provider-neutral pasteboard transfer"))
  val delete = CapabilityStatus("delete", "supported", Some("Delete a file or empty directory"))
  val search = CapabilityStatus("search", "degraded", Some("Search can fall back to scoped listing in a later implementation"))
  val preview = CapabilityStatus("preview", "supported", Some("Legacy bounded text preview API remains available for text openers"))

  def filesystem(readOnly: Boolean): List[CapabilityStatus] =
    val mutations =
      if readOnly then List(
        upload.copy(status = "unsupported", description = Some("Upload is disabled for read-only roots")),
        overwrite.copy(status = "unsupported", description = Some("Write-back is disabled for read-only roots")),
        createFolder.copy(status = "unsupported", description = Some("Create folder is disabled for read-only roots")),
        rename.copy(status = "unsupported", description = Some("Rename is disabled for read-only roots")),
        copy.copy(status = "unsupported", description = Some("Copy is disabled for read-only roots")),
        move.copy(status = "unsupported", description = Some("Move is disabled for read-only roots")),
        delete.copy(status = "unsupported", description = Some("Delete is disabled for read-only roots"))
      )
      else List(upload, overwrite, createFolder, rename, copy, move, delete)
    List(
      list,
      recursiveList,
      stat,
      open,
      download,
      fullRead,
      boundedRead,
      rangeRead,
      streamRead.copy(status = "supported", description = Some("Stream file content without loading the whole file into memory")),
      streamWrite.copy(status = "supported", description = Some("Write file content from a stream")),
      multipartUpload,
      verifyWrite,
      preview,
      search,
      transfer
    ) ++ mutations

  def s3(readOnly: Boolean, directory: Boolean = false): List[CapabilityStatus] =
    val objectStoreRename = rename.copy(status = "degraded", description = Some("S3 rename is implemented as copy then delete for objects"))
    val objectStoreMove = move.copy(status = "degraded", description = Some("S3 move is implemented as copy then delete for objects"))
    val directoryUnsupported = Some("Recursive prefix mutation is not implemented for S3 directory-like entries")
    val mutations =
      if readOnly then List(
        upload.copy(status = "unsupported", description = Some("Upload is disabled for read-only roots")),
        overwrite.copy(status = "unsupported", description = Some("Write-back is disabled for read-only roots")),
        createFolder.copy(status = "unsupported", description = Some("Create folder is disabled for read-only roots")),
        rename.copy(status = "unsupported", description = Some("Rename is disabled for read-only roots")),
        copy.copy(status = "unsupported", description = Some("Copy is disabled for read-only roots")),
        move.copy(status = "unsupported", description = Some("Move is disabled for read-only roots")),
        delete.copy(status = "unsupported", description = Some("Delete is disabled for read-only roots"))
      )
      else if directory then List(
        upload,
        overwrite.copy(status = "unsupported", description = directoryUnsupported),
        createFolder,
        rename.copy(status = "unsupported", description = directoryUnsupported),
        copy.copy(status = "unsupported", description = directoryUnsupported),
        move.copy(status = "unsupported", description = directoryUnsupported),
        delete.copy(status = "unsupported", description = directoryUnsupported)
      )
      else List(upload, overwrite, createFolder, objectStoreRename, copy, objectStoreMove, delete)
    List(list, recursiveList, stat, open, download, fullRead, boundedRead, rangeRead, streamRead, streamWrite, multipartUpload, verifyWrite, preview, search, transfer) ++ mutations

object EmptyMetadata:
  val unavailableFields: List[String] = List("version", "retention", "encryption")

  def apply(
      size: Option[Long],
      mimeType: Option[String],
      owner: Option[String],
      permissions: Option[String],
      modifiedTime: Option[String],
      fileName: String = ""
  ): EntryMetadata =
    val classification = FileTypeCatalog.classify(fileName, mimeType)
    EntryMetadata(
      size = size,
      mimeType = classification.mimeType.orElse(mimeType),
      owner = owner,
      permissions = permissions,
      modifiedTime = modifiedTime,
      version = None,
      retention = None,
      encryption = None,
      unavailable = unavailableFields,
      fileCategory = Some(classification.category),
      fileIcon = Some(classification.icon),
      mimeTypeSource = Some(classification.source)
    )
