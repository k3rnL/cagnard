package io.cagnard.backend.auth

import io.cagnard.backend.api.{ApiError, UserProfile}
import io.cagnard.backend.config.CagnardConfig
import io.circe.parser.parse

import java.nio.charset.StandardCharsets
import java.util.Base64

case class RequestIdentity(configuredUserHeader: Option[String], authorizationHeader: Option[String])
case class ResolvedUser(profile: UserProfile, authMode: String)

class UserResolver(config: CagnardConfig):
  private val configuredUsers = config.users.map(user => user.id -> user).toMap

  def resolve(identity: RequestIdentity): Either[ApiError, ResolvedUser] =
    identity.configuredUserHeader
      .filter(_.nonEmpty)
      .map(resolveConfigured)
      .orElse(resolveBearer(identity.authorizationHeader))
      .orElse(config.auth.defaultUser.map(resolveConfigured))
      .getOrElse(Left(ApiError("unauthorized", "No configured user or bearer identity resolved")))

  private def resolveConfigured(userId: String): Either[ApiError, ResolvedUser] =
    if !config.auth.configuredUsersEnabled then
      Left(ApiError("configured_users_disabled", "Configured users are disabled"))
    else
      configuredUsers
        .get(userId)
        .map(user =>
          ResolvedUser(
            UserProfile(user.id, user.displayName, user.roles, user.groups, user.claims),
            "configured-user"
          )
        )
        .toRight(ApiError("unknown_user", s"Configured user '$userId' was not found"))

  private def resolveBearer(header: Option[String]): Option[Either[ApiError, ResolvedUser]] =
    header
      .filter(_.startsWith("Bearer "))
      .map(_.stripPrefix("Bearer ").trim)
      .filter(_.nonEmpty)
      .map(parseJwtClaims)

  private def parseJwtClaims(token: String): Either[ApiError, ResolvedUser] =
    val parts = token.split("\\.")
    if parts.length < 2 then Left(ApiError("invalid_token", "Bearer token does not look like a JWT"))
    else
      val payload = new String(Base64.getUrlDecoder.decode(parts(1)), StandardCharsets.UTF_8)
      parse(payload).left.map(_ => ApiError("invalid_token", "Bearer token payload is not valid JSON")).flatMap { json =>
        val cursor = json.hcursor
        val issuer = cursor.get[String]("iss").getOrElse("")
        val knownIssuer = config.auth.oidcProviders.exists(_.issuer == issuer)
        if !knownIssuer then Left(ApiError("untrusted_issuer", s"Bearer token issuer '$issuer' is not configured"))
        else
          val id = cursor.get[String]("sub").getOrElse("external-user")
          val displayName = cursor.get[String]("name").getOrElse(id)
          val groups = cursor.get[List[String]]("groups").getOrElse(Nil)
          val roles = cursor.get[List[String]]("roles").getOrElse(Nil)
          val claims = cursor.keys.toList.flatten.flatMap(key => cursor.get[String](key).toOption.map(key -> _)).toMap
          Right(ResolvedUser(UserProfile(id, displayName, roles, groups, claims), "oidc-placeholder"))
      }
