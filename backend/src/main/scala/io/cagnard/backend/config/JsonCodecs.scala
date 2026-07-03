package io.cagnard.backend.config

import io.circe.{Decoder, Encoder, HCursor}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

object JsonCodecs:
  given Decoder[CagnardConfig] = deriveDecoder
  given Encoder[CagnardConfig] = deriveEncoder

  given Decoder[ServerConfig] = deriveDecoder
  given Encoder[ServerConfig] = deriveEncoder

  given Decoder[AuthConfig] = deriveDecoder
  given Encoder[AuthConfig] = deriveEncoder

  given Decoder[SessionConfig] = deriveDecoder
  given Encoder[SessionConfig] = deriveEncoder

  given Decoder[StaticProviderConfig] = deriveDecoder
  given Encoder[StaticProviderConfig] = deriveEncoder

  given Decoder[OidcProviderConfig] = deriveDecoder
  given Encoder[OidcProviderConfig] = deriveEncoder

  given Decoder[ConfiguredUser] = deriveDecoder
  given Encoder[ConfiguredUser] = deriveEncoder

  given Decoder[StaticUserCredentialConfig] = deriveDecoder
  given Encoder[StaticUserCredentialConfig] = deriveEncoder

  given Decoder[ProviderConfig] = Decoder.instance { cursor =>
    for
      id <- cursor.get[String]("id")
      providerType <- cursor.get[String]("type")
      family <- cursor.get[String]("family")
      displayName <- cursor.get[String]("displayName")
      settings <- optionalMap(cursor, "settings")
    yield ProviderConfig(id, providerType, family, displayName, settings)
  }
  given Encoder[ProviderConfig] = deriveEncoder

  given Decoder[StorageAccountConfig] = Decoder.instance { cursor =>
    for
      id <- cursor.get[String]("id")
      providerId <- cursor.get[String]("providerId")
      displayName <- cursor.get[String]("displayName")
      enabled <- cursor.get[Boolean]("enabled")
      readOnly <- cursor.get[Boolean]("readOnly")
      authMode <- cursor.get[String]("authMode")
      settings <- optionalMap(cursor, "settings")
    yield StorageAccountConfig(id, providerId, displayName, enabled, readOnly, authMode, settings)
  }
  given Encoder[StorageAccountConfig] = deriveEncoder

  given Decoder[StorageRootConfig] = Decoder.instance { cursor =>
    for
      id <- cursor.get[String]("id")
      label <- optionalString(cursor, "label")
      providerId <- cursor.get[String]("providerId")
      accountId <- cursor.get[String]("accountId")
      path <- optionalString(cursor, "path")
      settings <- optionalMap(cursor, "settings")
      allowedUsers <- optionalList(cursor, "allowedUsers")
      allowedRoles <- optionalList(cursor, "allowedRoles")
      allowedGroups <- optionalList(cursor, "allowedGroups")
    yield StorageRootConfig(id, label, providerId, accountId, path, settings, allowedUsers, allowedRoles, allowedGroups)
  }
  given Encoder[StorageRootConfig] = deriveEncoder

  given Decoder[UiPluginConfig] = deriveDecoder
  given Encoder[UiPluginConfig] = deriveEncoder

  private def optionalString(cursor: HCursor, field: String): Decoder.Result[Option[String]] =
    cursor.get[Option[String]](field).orElse(Right(None))

  private def optionalList(cursor: HCursor, field: String): Decoder.Result[Option[List[String]]] =
    cursor.get[Option[List[String]]](field).orElse(Right(None))

  private def optionalMap(cursor: HCursor, field: String): Decoder.Result[Option[Map[String, String]]] =
    cursor.get[Option[Map[String, String]]](field).orElse(Right(None))
