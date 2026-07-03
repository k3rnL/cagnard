package io.cagnard.backend.auth

import io.cagnard.backend.api.UserProfile
import io.cagnard.backend.config.{CagnardConfig, ConfiguredUser}

import java.security.MessageDigest
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

class StaticUserAuthProvider(config: CagnardConfig):
  private val users = config.users.map(user => user.id -> user).toMap
  val providerId: String = config.auth.staticProvider.flatMap(_.id).getOrElse("static")
  val enabled: Boolean = config.auth.configuredUsersEnabled && config.auth.staticProvider.flatMap(_.enabled).getOrElse(true)

  def metadata: Option[AuthProviderMetadata] =
    Option.when(enabled)(
      AuthProviderMetadata(
        id = providerId,
        label = config.auth.staticProvider.flatMap(_.label).getOrElse("Cagnard account"),
        kind = "static",
        loginUrl = Some("/api/auth/login"),
        fields = List(
          AuthProviderField("username", "User", "text", required = true),
          AuthProviderField("password", "Password", "password", required = true)
        ),
        capabilities = List("password-login")
      )
    )

  def authenticate(credentials: StaticLoginCredentials): Either[AuthFailure, AuthenticatedPrincipal] =
    if !enabled then Left(genericFailure)
    else
      users.get(credentials.username) match
        case Some(user) if verify(user, credentials.password) =>
          Right(
            AuthenticatedPrincipal(
              providerId = providerId,
              subject = user.id,
              profile = profile(user),
              authMode = "static"
            )
          )
        case _ => Left(genericFailure)

  def principalForSubject(subject: String): Either[AuthFailure, AuthenticatedPrincipal] =
    users
      .get(subject)
      .map(user => AuthenticatedPrincipal(providerId, user.id, profile(user), "static"))
      .toRight(AuthFailure("invalid_session", "Session user is no longer configured"))

  private def verify(user: ConfiguredUser, password: String): Boolean =
    user.credential.exists(credential => PasswordVerifier.verify(password, credential.verifier))

  private def profile(user: ConfiguredUser): UserProfile =
    UserProfile(user.id, user.displayName, user.roles, user.groups, user.claims)

  private def genericFailure: AuthFailure =
    AuthFailure("authentication_failed", "Invalid username or password")

object PasswordVerifier:
  private val Pbkdf2Sha256 = "pbkdf2-sha256"
  private val keyFactory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
  private val decoder = Base64.getUrlDecoder

  def verify(password: String, verifier: String): Boolean =
    verifier.split(":", 4).toList match
      case Pbkdf2Sha256 :: iterationsRaw :: saltRaw :: hashRaw :: Nil =>
        iterationsRaw.toIntOption.exists { iterations =>
          val expected = decoder.decode(hashRaw)
          val salt = decoder.decode(saltRaw)
          val actual = hash(password, salt, iterations, expected.length)
          MessageDigest.isEqual(actual, expected)
        }
      case _ => false

  private def hash(password: String, salt: Array[Byte], iterations: Int, lengthBytes: Int): Array[Byte] =
    val spec = PBEKeySpec(password.toCharArray, salt, iterations, lengthBytes * 8)
    keyFactory.generateSecret(spec).getEncoded
