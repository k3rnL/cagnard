package io.cagnard.backend.auth

import io.cagnard.backend.auth.AuthModels.given
import io.cagnard.backend.config.CagnardConfig
import io.circe.parser.decode
import io.circe.syntax.*

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import scala.util.Try

class SessionService(config: CagnardConfig, clock: () => Instant = () => Instant.now()):
  val cookieName: String = config.auth.session.flatMap(_.cookieName).getOrElse("CAGNARD_SESSION")
  val ttlSeconds: Long = config.auth.session.flatMap(_.ttlSeconds).getOrElse(8 * 60 * 60L)
  val secureCookies: Boolean = config.auth.session.flatMap(_.secureCookies).getOrElse(false)
  private val signingSecret = config.auth.session.flatMap(_.signingSecret).getOrElse("")
  private val encoder = Base64.getUrlEncoder.withoutPadding()
  private val decoder = Base64.getUrlDecoder

  def issue(principal: AuthenticatedPrincipal): String =
    val now = clock().getEpochSecond
    val claims = SessionClaims(principal.providerId, principal.subject, now, now + ttlSeconds)
    encode(claims)

  def verify(token: String): Either[AuthFailure, SessionClaims] =
    token.split("\\.", 3).toList match
      case header :: payload :: signature :: Nil =>
        val signed = s"$header.$payload"
        val expected = sign(signed)
        if !MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), signature.getBytes(StandardCharsets.UTF_8)) then
          Left(AuthFailure("invalid_session", "Session signature is invalid"))
        else
          decodePayload(payload).flatMap { claims =>
            if claims.expiresAt <= clock().getEpochSecond then Left(AuthFailure("session_expired", "Session has expired"))
            else Right(claims)
          }
      case _ => Left(AuthFailure("invalid_session", "Session token is malformed"))

  def cookie(token: String): String =
    val secure = if secureCookies then "; Secure" else ""
    s"$cookieName=$token; Path=/; HttpOnly; SameSite=Lax; Max-Age=$ttlSeconds$secure"

  def clearCookie: String =
    val secure = if secureCookies then "; Secure" else ""
    s"$cookieName=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0$secure"

  private def encode(claims: SessionClaims): String =
    val header = base64("""{"alg":"HS256","typ":"CagnardSession"}""")
    val payload = base64(claims.asJson.noSpaces)
    val unsigned = s"$header.$payload"
    s"$unsigned.${sign(unsigned)}"

  private def decodePayload(payload: String): Either[AuthFailure, SessionClaims] =
    Try(new String(decoder.decode(payload), StandardCharsets.UTF_8))
      .toEither
      .left
      .map(_ => AuthFailure("invalid_session", "Session payload is invalid"))
      .flatMap(raw => decode[SessionClaims](raw).left.map(_ => AuthFailure("invalid_session", "Session payload is invalid")))

  private def sign(value: String): String =
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(signingSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"))
    encoder.encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)))

  private def base64(value: String): String =
    encoder.encodeToString(value.getBytes(StandardCharsets.UTF_8))
