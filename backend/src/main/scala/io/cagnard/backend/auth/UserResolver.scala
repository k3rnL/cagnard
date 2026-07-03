package io.cagnard.backend.auth

import io.cagnard.backend.api.{ApiError, UserProfile}
import io.cagnard.backend.config.CagnardConfig
import io.circe.parser.parse

import java.nio.charset.StandardCharsets
import java.util.Base64

class UserResolver(config: CagnardConfig):
  private val configuredUsers = config.users.map(user => user.id -> user).toMap
  private val staticProvider = StaticUserAuthProvider(config)
  private val sessions = SessionService(config)
  private val authMode = config.auth.mode.getOrElse("development")

  def providers: List[AuthProviderMetadata] =
    authMode match
      case "static" => staticProvider.metadata.toList
      case "development" => Nil
      case "external" => Nil
      case _ => Nil

  def loginStatic(username: String, password: String): Either[ApiError, (ResolvedUser, String)] =
    if authMode != "static" then Left(ApiError("authentication_disabled", "Static login is not enabled"))
    else
      staticProvider.authenticate(StaticLoginCredentials(username, password)).left.map(toApiError).map { principal =>
        (ResolvedUser(principal.profile, principal.authMode), sessions.issue(principal))
      }

  def resolve(identity: RequestIdentity): Either[ApiError, ResolvedUser] =
    authMode match
      case "static" => resolveSession(identity)
      case "development" => resolveDevelopment(identity)
      case "external" => resolveBearer(identity.authorizationHeader).getOrElse(Left(ApiError("unauthorized", "No bearer identity resolved")))
      case other => Left(ApiError("invalid_auth_mode", s"Unsupported auth mode '$other'"))

  def sessionCookie(token: String): String = sessions.cookie(token)

  def clearSessionCookie: String = sessions.clearCookie

  private def resolveSession(identity: RequestIdentity): Either[ApiError, ResolvedUser] =
    val token = bearerToken(identity.authorizationHeader).orElse(identity.cookies.get(sessions.cookieName))
    token
      .toRight(ApiError("unauthorized", "Authentication is required"))
      .flatMap(sessions.verify(_).left.map(toApiError))
      .flatMap { claims =>
        if claims.providerId != staticProvider.providerId then Left(ApiError("invalid_session", "Session provider is not enabled"))
        else staticProvider.principalForSubject(claims.subject).left.map(toApiError)
      }
      .map(principal => ResolvedUser(principal.profile, principal.authMode))

  private def resolveDevelopment(identity: RequestIdentity): Either[ApiError, ResolvedUser] =
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
    bearerToken(header).map(parseJwtClaims)

  private def bearerToken(header: Option[String]): Option[String] =
    header
      .filter(_.startsWith("Bearer "))
      .map(_.stripPrefix("Bearer ").trim)
      .filter(_.nonEmpty)

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

  private def toApiError(failure: AuthFailure): ApiError =
    ApiError(failure.code, failure.message)
