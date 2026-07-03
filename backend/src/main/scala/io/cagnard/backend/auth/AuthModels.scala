package io.cagnard.backend.auth

import io.cagnard.backend.api.UserProfile
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

case class RequestIdentity(
    configuredUserHeader: Option[String],
    authorizationHeader: Option[String],
    cookies: Map[String, String]
)

case class AuthProviderMetadata(
    id: String,
    label: String,
    kind: String,
    loginUrl: Option[String],
    fields: List[AuthProviderField],
    capabilities: List[String]
)

case class AuthProviderField(name: String, label: String, kind: String, required: Boolean)

case class StaticLoginCredentials(username: String, password: String)

case class AuthenticatedPrincipal(
    providerId: String,
    subject: String,
    profile: UserProfile,
    authMode: String
)

case class AuthFailure(code: String, message: String)

case class SessionClaims(providerId: String, subject: String, issuedAt: Long, expiresAt: Long)

case class ResolvedUser(profile: UserProfile, authMode: String)

object AuthModels:
  given Encoder[AuthProviderMetadata] = deriveEncoder
  given Decoder[AuthProviderMetadata] = deriveDecoder

  given Encoder[AuthProviderField] = deriveEncoder
  given Decoder[AuthProviderField] = deriveDecoder

  given Encoder[SessionClaims] = deriveEncoder
  given Decoder[SessionClaims] = deriveDecoder
