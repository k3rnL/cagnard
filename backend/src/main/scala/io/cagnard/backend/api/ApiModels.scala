package io.cagnard.backend.api

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import io.cagnard.backend.auth.{AuthProviderField, AuthProviderMetadata}

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

case class AuthProvidersResponse(providers: List[AuthProviderMetadata])

case class LoginRequest(providerId: String, username: Option[String], password: Option[String])

case class LoginResponse(session: SessionResponse)

case class LogoutResponse(success: Boolean)

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
    unavailable: List[String],
    fileCategory: Option[String] = None,
    fileIcon: Option[String] = None,
    mimeTypeSource: Option[String] = None
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

case class TransferSourceRequest(intent: String, tunnel: String, rootId: String, path: String)

case class TransferDestinationRequest(tunnel: String, rootId: String, path: String)

case class TransferRequest(
    sources: List[TransferSourceRequest],
    destination: TransferDestinationRequest,
    conflictPolicy: String
)

case class TransferItemResult(
    intent: String,
    sourceTunnel: String,
    sourceRootId: String,
    sourcePath: String,
    targetPath: Option[String],
    status: String,
    message: String,
    entry: Option[StorageEntry],
    children: List[TransferItemResult] = Nil
)

case class TransferResponse(success: Boolean, message: String, results: List[TransferItemResult])

case class UiPluginManifest(
    id: String,
    label: String,
    kind: String,
    apiVersion: String,
    mimeTypes: List[String],
    extensions: List[String],
    permissions: List[String],
    priority: Int,
    categories: List[String] = Nil,
    mode: String = "viewer",
    editMode: String = "none",
    readStrategy: String = "bounded",
    saveStrategy: String = "none",
    maxSizeBytes: Option[Long] = None,
    requiredCapabilities: List[String] = Nil
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

  given Encoder[AuthProviderField] = deriveEncoder
  given Decoder[AuthProviderField] = deriveDecoder

  given Encoder[AuthProviderMetadata] = deriveEncoder
  given Decoder[AuthProviderMetadata] = deriveDecoder

  given Encoder[AuthProvidersResponse] = deriveEncoder
  given Decoder[AuthProvidersResponse] = deriveDecoder

  given Encoder[LoginRequest] = deriveEncoder
  given Decoder[LoginRequest] = deriveDecoder

  given Encoder[LoginResponse] = deriveEncoder
  given Decoder[LoginResponse] = deriveDecoder

  given Encoder[LogoutResponse] = deriveEncoder
  given Decoder[LogoutResponse] = deriveDecoder

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

  given Encoder[TransferSourceRequest] = deriveEncoder
  given Decoder[TransferSourceRequest] = deriveDecoder

  given Encoder[TransferDestinationRequest] = deriveEncoder
  given Decoder[TransferDestinationRequest] = deriveDecoder

  given Encoder[TransferRequest] = deriveEncoder
  given Decoder[TransferRequest] = deriveDecoder

  given Encoder[TransferItemResult] = deriveEncoder

  given Encoder[TransferResponse] = deriveEncoder

  given Encoder[UiPluginManifest] = deriveEncoder
  given Decoder[UiPluginManifest] = deriveDecoder

  given Encoder[UiPluginsResponse] = deriveEncoder
  given Decoder[UiPluginsResponse] = deriveDecoder
