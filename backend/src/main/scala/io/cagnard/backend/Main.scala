package io.cagnard.backend

import cats.effect.{ExitCode, IO, IOApp, Resource}
import com.comcast.ip4s.{Host, Port}
import io.cagnard.backend.api.{ApiRoutes, ApiService}
import io.cagnard.backend.config.ConfigLoader
import io.cagnard.backend.storage.StorageRegistry
import org.http4s.ember.server.EmberServerBuilder
import org.http4s.server.middleware.CORS

import java.nio.file.{Files, Path, Paths}

object Main extends IOApp:
  override def run(args: List[String]): IO[ExitCode] =
    val configPath = sys.env.get("CAGNARD_CONFIG").orElse(args.headOption).map(Paths.get(_)).getOrElse(defaultConfigPath)

    for
      config <- ConfigLoader.load(configPath)
      registry <- IO.fromEither(StorageRegistry.fromConfig(config))
      service = ApiService(config, registry)
      routes = ApiRoutes(service).routes
      host <- IO.fromOption(Host.fromString(config.server.host))(new IllegalArgumentException(s"Invalid host: ${config.server.host}"))
      port <- IO.fromOption(Port.fromInt(config.server.port))(new IllegalArgumentException(s"Invalid port: ${config.server.port}"))
      _ <- server(host, port, routes).useForever
    yield ExitCode.Success

  private def server(host: Host, port: Port, routes: org.http4s.HttpRoutes[IO]): Resource[IO, Unit] =
    EmberServerBuilder
      .default[IO]
      .withHost(host)
      .withPort(port)
      .withHttpApp(CORS.policy.withAllowOriginAll(routes).orNotFound)
      .build
      .evalMap(server => IO.println(s"Cagnard backend listening on ${server.address}"))

  private def defaultConfigPath: Path =
    val rootRelative = Paths.get("config/cagnard.example.conf")
    if Files.exists(rootRelative) then rootRelative else Paths.get("..", "config", "cagnard.example.conf")
