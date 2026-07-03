package io.cagnard.backend.storage

import io.cagnard.backend.api.{CapabilityStatus, EntryMetadata, StorageEntry}

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

case class FileContent(fileName: String, mimeType: Option[String], bytes: Array[Byte])

case class TextPreview(path: String, mimeType: Option[String], content: String, truncated: Boolean)

object StorageCapabilities:
  val list = CapabilityStatus("list", "supported", Some("List children for a storage location"))
  val stat = CapabilityStatus("stat", "supported", Some("Read normalized metadata for a storage entry"))
  val download = CapabilityStatus("download", "supported", Some("Read file content from the provider"))
  val upload = CapabilityStatus("upload", "supported", Some("Write file content to the provider"))
  val createFolder = CapabilityStatus("create-folder", "supported", Some("Create a directory in the provider"))
  val rename = CapabilityStatus("rename", "supported", Some("Rename a file or directory"))
  val copy = CapabilityStatus("copy", "supported", Some("Copy a file inside the storage root"))
  val move = CapabilityStatus("move", "supported", Some("Move a file or directory inside the storage root"))
  val delete = CapabilityStatus("delete", "supported", Some("Delete a file or empty directory"))
  val search = CapabilityStatus("search", "degraded", Some("Search can fall back to scoped listing in a later implementation"))
  val preview = CapabilityStatus("preview", "supported", Some("Preview can use scoped download for supported text formats"))

  def filesystem(readOnly: Boolean): List[CapabilityStatus] =
    val mutations =
      if readOnly then List(
        upload.copy(status = "unsupported", description = Some("Upload is disabled for read-only roots")),
        createFolder.copy(status = "unsupported", description = Some("Create folder is disabled for read-only roots")),
        rename.copy(status = "unsupported", description = Some("Rename is disabled for read-only roots")),
        copy.copy(status = "unsupported", description = Some("Copy is disabled for read-only roots")),
        move.copy(status = "unsupported", description = Some("Move is disabled for read-only roots")),
        delete.copy(status = "unsupported", description = Some("Delete is disabled for read-only roots"))
      )
      else List(upload, createFolder, rename, copy, move, delete)
    List(list, stat, download, preview, search) ++ mutations

  def s3(readOnly: Boolean, directory: Boolean = false): List[CapabilityStatus] =
    val objectStoreRename = rename.copy(status = "degraded", description = Some("S3 rename is implemented as copy then delete for objects"))
    val objectStoreMove = move.copy(status = "degraded", description = Some("S3 move is implemented as copy then delete for objects"))
    val directoryUnsupported = Some("Recursive prefix mutation is not implemented for S3 directory-like entries")
    val mutations =
      if readOnly then List(
        upload.copy(status = "unsupported", description = Some("Upload is disabled for read-only roots")),
        createFolder.copy(status = "unsupported", description = Some("Create folder is disabled for read-only roots")),
        rename.copy(status = "unsupported", description = Some("Rename is disabled for read-only roots")),
        copy.copy(status = "unsupported", description = Some("Copy is disabled for read-only roots")),
        move.copy(status = "unsupported", description = Some("Move is disabled for read-only roots")),
        delete.copy(status = "unsupported", description = Some("Delete is disabled for read-only roots"))
      )
      else if directory then List(
        upload,
        createFolder,
        rename.copy(status = "unsupported", description = directoryUnsupported),
        copy.copy(status = "unsupported", description = directoryUnsupported),
        move.copy(status = "unsupported", description = directoryUnsupported),
        delete.copy(status = "unsupported", description = directoryUnsupported)
      )
      else List(upload, createFolder, objectStoreRename, copy, objectStoreMove, delete)
    List(list, stat, download, preview, search) ++ mutations

object EmptyMetadata:
  val unavailableFields: List[String] = List("version", "retention", "encryption")

  def apply(
      size: Option[Long],
      mimeType: Option[String],
      owner: Option[String],
      permissions: Option[String],
      modifiedTime: Option[String]
  ): EntryMetadata =
    EntryMetadata(
      size = size,
      mimeType = mimeType,
      owner = owner,
      permissions = permissions,
      modifiedTime = modifiedTime,
      version = None,
      retention = None,
      encryption = None,
      unavailable = unavailableFields
    )
