package io.cagnard.backend.config

import cats.effect.IO
import com.typesafe.config.{ConfigFactory, ConfigParseOptions, ConfigRenderOptions, ConfigResolveOptions}
import io.circe.parser.decode
import io.cagnard.backend.config.JsonCodecs.given

import java.nio.file.Path

object ConfigLoader:
  def load(path: Path): IO[CagnardConfig] =
    val normalizedPath = path.toAbsolutePath.normalize()
    IO.blocking(renderHocon(normalizedPath))
      .handleErrorWith(error => IO.raiseError(new IllegalArgumentException(s"Invalid config ${normalizedPath}: ${error.getMessage}", error)))
      .flatMap { raw =>
        IO.fromEither(decode[CagnardConfig](raw).left.map(error => new IllegalArgumentException(s"Invalid config ${normalizedPath}: ${error.getMessage}")))
          .map(resolveRelativePaths(normalizedPath, _))
      }

  private def renderHocon(path: Path): String =
    val parsed = ConfigFactory.parseFile(path.toFile, ConfigParseOptions.defaults().setAllowMissing(false))
    val substitutions = parsed
      .withFallback(ConfigFactory.defaultOverrides())
      .withFallback(ConfigFactory.systemEnvironment())

    parsed
      .resolveWith(substitutions, ConfigResolveOptions.defaults().setUseSystemEnvironment(true))
      .root()
      .render(ConfigRenderOptions.concise())

  private def resolveRelativePaths(configPath: Path, config: CagnardConfig): CagnardConfig =
    val base = Option(configPath.getParent).getOrElse(Path.of(".")).toAbsolutePath.normalize()
    config.copy(
      personalStorage = config.personalStorage.map(resolveRoot(base, _)),
      globalStorage = config.globalStorage.map(resolveRoot(base, _))
    )

  private def resolveRoot(base: Path, root: StorageRootConfig): StorageRootConfig =
    val configured = Path.of(root.path)
    if configured.isAbsolute then root
    else root.copy(path = base.resolve(configured).normalize().toString)
