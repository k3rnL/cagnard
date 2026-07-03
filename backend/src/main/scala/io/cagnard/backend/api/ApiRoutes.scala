package io.cagnard.backend.api

import cats.effect.IO
import fs2.Stream
import io.cagnard.backend.api.ApiModels.given
import io.cagnard.backend.auth.RequestIdentity
import org.http4s.{Header, HttpRoutes, Request, Response, Status}
import org.http4s.circe.CirceEntityCodec.given
import org.http4s.dsl.Http4sDsl
import org.typelevel.ci.CIString

case class ApiRoutes(service: ApiService) extends Http4sDsl[IO]:
  private object TunnelQuery extends QueryParamDecoderMatcher[String]("tunnel")
  private object RootIdQuery extends QueryParamDecoderMatcher[String]("rootId")
  private object PathQuery extends OptionalQueryParamDecoderMatcher[String]("path")
  private object OverwriteQuery extends OptionalQueryParamDecoderMatcher[Boolean]("overwrite")

  val routes: HttpRoutes[IO] =
    HttpRoutes.of[IO] {
      case GET -> Root / "api" / "health" =>
        service.health.flatMap(Ok(_))

      case request @ GET -> Root / "api" / "session" =>
        respond(service.session(identity(request)))

      case GET -> Root / "api" / "auth" / "providers" =>
        respond(service.authProviders)

      case request @ POST -> Root / "api" / "auth" / "login" =>
        request.as[LoginRequest].flatMap { body =>
          service.login(body).flatMap {
            case Right(result) =>
              Ok(result.response).map(_.putHeaders(Header.Raw(CIString("Set-Cookie"), result.setCookie)))
            case Left(error) => errorResponse(error)
          }
        }

      case POST -> Root / "api" / "auth" / "logout" =>
        service.logout.flatMap { result =>
          Ok(result.response).map(_.putHeaders(Header.Raw(CIString("Set-Cookie"), result.setCookie)))
        }

      case request @ GET -> Root / "api" / "storage" / "navigation" =>
        respond(service.navigation(identity(request)))

      case request @ GET -> Root / "api" / "storage" / "entries" :? TunnelQuery(tunnel) +& RootIdQuery(rootId) +& PathQuery(path) =>
        respond(service.listEntries(identity(request), tunnel, rootId, path.getOrElse("")))

      case request @ GET -> Root / "api" / "storage" / "stat" :? TunnelQuery(tunnel) +& RootIdQuery(rootId) +& PathQuery(path) =>
        respond(service.statEntry(identity(request), tunnel, rootId, path.getOrElse("")))

      case request @ GET -> Root / "api" / "storage" / "content" :? TunnelQuery(tunnel) +& RootIdQuery(rootId) +& PathQuery(path) =>
        service.downloadContent(identity(request), tunnel, rootId, path.getOrElse("")).flatMap {
          case Right(content) =>
            IO.pure(
              Response[IO](status = Status.Ok)
                .withEntity(Stream.emits(content.bytes).covary[IO])
                .putHeaders(
                Header.Raw(CIString("Content-Type"), content.mimeType.getOrElse("application/octet-stream")),
                Header.Raw(CIString("Content-Disposition"), s"""attachment; filename="${safeFileName(content.fileName)}"""")
              )
            )
          case Left(error) => errorResponse(error)
        }

      case request @ PUT -> Root / "api" / "storage" / "content" :? TunnelQuery(tunnel) +& RootIdQuery(rootId) +& PathQuery(path) +& OverwriteQuery(overwrite) =>
        request.body.compile.to(Array).flatMap { bytes =>
          respond(service.uploadContent(identity(request), tunnel, rootId, path.getOrElse(""), overwrite.getOrElse(false), bytes))
        }

      case request @ GET -> Root / "api" / "storage" / "preview" :? TunnelQuery(tunnel) +& RootIdQuery(rootId) +& PathQuery(path) =>
        respond(service.previewContent(identity(request), tunnel, rootId, path.getOrElse("")))

      case request @ POST -> Root / "api" / "storage" / "folders" =>
        request.as[CreateFolderRequest].flatMap(body => respond(service.createFolder(identity(request), body)))

      case request @ POST -> Root / "api" / "storage" / "rename" =>
        request.as[RenameEntryRequest].flatMap(body => respond(service.renameEntry(identity(request), body)))

      case request @ POST -> Root / "api" / "storage" / "delete" =>
        request.as[DeleteEntryRequest].flatMap(body => respond(service.deleteEntry(identity(request), body)))

      case request @ POST -> Root / "api" / "storage" / "copy" =>
        request.as[CopyEntryRequest].flatMap(body => respond(service.copyEntry(identity(request), body)))

      case request @ POST -> Root / "api" / "storage" / "move" =>
        request.as[MoveEntryRequest].flatMap(body => respond(service.moveEntry(identity(request), body)))

      case request @ GET -> Root / "api" / "plugins" / "ui" =>
        respond(service.uiPlugins(identity(request)))
    }

  private def respond[A](result: IO[Either[ApiError, A]])(using io.circe.Encoder[A]) =
    result.flatMap {
      case Right(value) => Ok(value)
      case Left(error) => errorResponse(error)
    }

  private def errorResponse(error: ApiError) =
    if authErrorCodes.contains(error.code) then IO.pure(Response[IO](status = Status.Unauthorized).withEntity(error))
    else BadRequest(error)

  private val authErrorCodes =
    Set("unauthorized", "authentication_failed", "authentication_disabled", "invalid_session", "session_expired", "invalid_token", "untrusted_issuer")

  private def identity(request: Request[IO]): RequestIdentity =
    val user = request.headers.get(CIString("X-Cagnard-User")).map(_.head.value)
    val auth = request.headers.get(CIString("Authorization")).map(_.head.value)
    val cookies = request.headers.headers.filter(_.name == CIString("Cookie")).flatMap(header => parseCookies(header.value)).toMap
    RequestIdentity(user, auth, cookies)

  private def parseCookies(raw: String): List[(String, String)] =
    raw
      .split(";")
      .toList
      .flatMap { part =>
        part.trim.split("=", 2).toList match
          case key :: value :: Nil if key.nonEmpty => Some(key -> value)
          case _ => None
      }

  private def safeFileName(name: String): String =
    name.replace("\"", "").replace("\r", "").replace("\n", "")
