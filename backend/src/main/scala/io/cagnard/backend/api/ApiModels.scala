package io.cagnard.backend.api

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

case class ApiError(code: String, message: String)

case class HealthResponse(status: String, stateless: Boolean, providers: Int, configuredUsers: Int)

case class UserProfile(
    id: String,
    displayName: String,
    roles: List[String],
    groups: List[String],
    claims: Map[String, String]
)

case class SessionResponse(
    user: UserProfile,
    authMode: String,
    personalEnabled: Boolean,
    globalEnabled: Boolean
)

case class CapabilityStatus(name: String, status: String, description: Option[String])

case class NavigationRoot(
    id: String,
    label: String,
    tunnel: String,
    providerId: String,
    accountId: String,
    providerFamily: String,
    readOnly: Boolean,
    capabilities: List[CapabilityStatus]
)

case class NavigationSection(label: String, roots: List[NavigationRoot])

case class NavigationResponse(personal: Option[NavigationSection], global: Option[NavigationSection])

case class EntryMetadata(
    size: Option[Long],
    mimeType: Option[String],
    owner: Option[String],
    permissions: Option[String],
    modifiedTime: Option[String],
    version: Option[String],
    retention: Option[String],
    encryption: Option[String],
    unavailable: List[String]
)

case class StorageEntry(
    id: String,
    name: String,
    path: String,
    kind: String,
    metadata: EntryMetadata,
    capabilities: List[CapabilityStatus],
    providerSpecific: Map[String, String]
)

case class EntryListResponse(root: NavigationRoot, path: String, entries: List[StorageEntry])

case class OperationResponse(success: Boolean, message: String, entry: Option[StorageEntry])

case class PreviewResponse(path: String, mimeType: Option[String], content: String, truncated: Boolean)

case class CreateFolderRequest(tunnel: String, rootId: String, parentPath: String, name: String)

case class RenameEntryRequest(tunnel: String, rootId: String, path: String, newName: String)

case class DeleteEntryRequest(tunnel: String, rootId: String, path: String, confirmed: Boolean)

case class CopyEntryRequest(tunnel: String, rootId: String, sourcePath: String, targetPath: String, overwrite: Boolean)

case class MoveEntryRequest(tunnel: String, rootId: String, sourcePath: String, targetPath: String, overwrite: Boolean)

case class UiPluginManifest(
    id: String,
    label: String,
    kind: String,
    apiVersion: String,
    mimeTypes: List[String],
    extensions: List[String],
    permissions: List[String],
    priority: Int
)

case class UiPluginsResponse(plugins: List[UiPluginManifest])

object ApiModels:
  given Encoder[ApiError] = deriveEncoder
  given Decoder[ApiError] = deriveDecoder

  given Encoder[HealthResponse] = deriveEncoder
  given Decoder[HealthResponse] = deriveDecoder

  given Encoder[UserProfile] = deriveEncoder
  given Decoder[UserProfile] = deriveDecoder

  given Encoder[SessionResponse] = deriveEncoder
  given Decoder[SessionResponse] = deriveDecoder

  given Encoder[CapabilityStatus] = deriveEncoder
  given Decoder[CapabilityStatus] = deriveDecoder

  given Encoder[NavigationRoot] = deriveEncoder
  given Decoder[NavigationRoot] = deriveDecoder

  given Encoder[NavigationSection] = deriveEncoder
  given Decoder[NavigationSection] = deriveDecoder

  given Encoder[NavigationResponse] = deriveEncoder
  given Decoder[NavigationResponse] = deriveDecoder

  given Encoder[EntryMetadata] = deriveEncoder
  given Decoder[EntryMetadata] = deriveDecoder

  given Encoder[StorageEntry] = deriveEncoder
  given Decoder[StorageEntry] = deriveDecoder

  given Encoder[EntryListResponse] = deriveEncoder
  given Decoder[EntryListResponse] = deriveDecoder

  given Encoder[OperationResponse] = deriveEncoder
  given Decoder[OperationResponse] = deriveDecoder

  given Encoder[PreviewResponse] = deriveEncoder
  given Decoder[PreviewResponse] = deriveDecoder

  given Encoder[CreateFolderRequest] = deriveEncoder
  given Decoder[CreateFolderRequest] = deriveDecoder

  given Encoder[RenameEntryRequest] = deriveEncoder
  given Decoder[RenameEntryRequest] = deriveDecoder

  given Encoder[DeleteEntryRequest] = deriveEncoder
  given Decoder[DeleteEntryRequest] = deriveDecoder

  given Encoder[CopyEntryRequest] = deriveEncoder
  given Decoder[CopyEntryRequest] = deriveDecoder

  given Encoder[MoveEntryRequest] = deriveEncoder
  given Decoder[MoveEntryRequest] = deriveDecoder

  given Encoder[UiPluginManifest] = deriveEncoder
  given Decoder[UiPluginManifest] = deriveDecoder

  given Encoder[UiPluginsResponse] = deriveEncoder
  given Decoder[UiPluginsResponse] = deriveDecoder
