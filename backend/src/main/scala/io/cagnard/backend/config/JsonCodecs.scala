package io.cagnard.backend.config

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

object JsonCodecs:
  given Decoder[CagnardConfig] = deriveDecoder
  given Encoder[CagnardConfig] = deriveEncoder

  given Decoder[ServerConfig] = deriveDecoder
  given Encoder[ServerConfig] = deriveEncoder

  given Decoder[AuthConfig] = deriveDecoder
  given Encoder[AuthConfig] = deriveEncoder

  given Decoder[OidcProviderConfig] = deriveDecoder
  given Encoder[OidcProviderConfig] = deriveEncoder

  given Decoder[ConfiguredUser] = deriveDecoder
  given Encoder[ConfiguredUser] = deriveEncoder

  given Decoder[ProviderConfig] = deriveDecoder
  given Encoder[ProviderConfig] = deriveEncoder

  given Decoder[StorageAccountConfig] = deriveDecoder
  given Encoder[StorageAccountConfig] = deriveEncoder

  given Decoder[StorageRootConfig] = deriveDecoder
  given Encoder[StorageRootConfig] = deriveEncoder

  given Decoder[UiPluginConfig] = deriveDecoder
  given Encoder[UiPluginConfig] = deriveEncoder
