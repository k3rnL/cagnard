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
          .flatMap(validate(normalizedPath, _))
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
    val providersById = config.providers.map(provider => provider.id -> provider).toMap
    config.copy(
      personalStorage = config.personalStorage.map(resolveRoot(base, providersById, _)),
      globalStorage = config.globalStorage.map(resolveRoot(base, providersById, _))
    )

  private def resolveRoot(base: Path, providersById: Map[String, ProviderConfig], root: StorageRootConfig): StorageRootConfig =
    providersById.get(root.providerId).map(_.`type`) match
      case Some("filesystem") =>
        root.path match
          case Some(rawPath) =>
            val configured = Path.of(rawPath)
            if configured.isAbsolute then root
            else root.copy(path = Some(base.resolve(configured).normalize().toString))
          case None => root
      case _ => root

  private def validate(path: Path, config: CagnardConfig): IO[CagnardConfig] =
    val authMode = config.auth.mode.getOrElse("development")
    val validModes = Set("static", "development", "external")
    val errors =
      List(
        Option.when(!validModes.contains(authMode))(s"auth.mode must be one of ${validModes.toList.sorted.mkString(", ")}"),
        Option.when(authMode == "static" && !config.auth.configuredUsersEnabled)("auth.configuredUsersEnabled must be true when auth.mode = static"),
        Option.when(authMode == "static" && config.auth.session.flatMap(_.signingSecret).forall(_.trim.isEmpty))("auth.session.signingSecret is required when auth.mode = static"),
        Option.when(authMode == "static" && config.users.exists(_.credential.isEmpty))("all configured users require users[].credential.verifier when auth.mode = static")
      ).flatten ++ providerErrors(config)

    if errors.isEmpty then IO.pure(config)
    else IO.raiseError(new IllegalArgumentException(s"Invalid config ${path.toAbsolutePath.normalize()}: ${errors.mkString("; ")}"))

  private def providerErrors(config: CagnardConfig): List[String] =
    val providersById = config.providers.map(provider => provider.id -> provider).toMap
    val accountsById = config.accounts.map(account => account.id -> account).toMap
    val s3ProviderIds = config.providers.filter(_.`type` == "s3").map(_.id).toSet
    val roots = config.personalStorage ++ config.globalStorage

    val providerErrors =
      config.providers.flatMap { provider =>
        provider.`type` match
          case "filesystem" => Nil
          case "s3" =>
            val settings = provider.settings.getOrElse(Map.empty)
            List(
              Option.when(settings.get("region").forall(_.trim.isEmpty))(s"providers.${provider.id}.settings.region is required for S3 providers")
            ).flatten
          case other => List(s"providers.${provider.id}.type '$other' is not supported")
      }

    val accountErrors =
      config.accounts.filter(account => s3ProviderIds.contains(account.providerId)).flatMap { account =>
        val settings = account.settings.getOrElse(Map.empty)
        val mode = settings.get("credentialMode").orElse(Option(account.authMode)).map(_.trim).filter(_.nonEmpty).getOrElse("static")
        mode match
          case "static" =>
            List(
              Option.when(settings.get("accessKeyId").forall(_.trim.isEmpty))(s"accounts.${account.id}.settings.accessKeyId is required for static S3 credentials"),
              Option.when(settings.get("secretAccessKey").forall(_.trim.isEmpty))(s"accounts.${account.id}.settings.secretAccessKey is required for static S3 credentials")
            ).flatten
          case "default-chain" => Nil
          case "profile" =>
            List(Option.when(settings.get("profile").forall(_.trim.isEmpty))(s"accounts.${account.id}.settings.profile is required for S3 profile credentials")).flatten
          case other => List(s"accounts.${account.id}.settings.credentialMode '$other' is not supported for S3 accounts")
      }

    val rootErrors =
      roots.flatMap { root =>
        val providerType = providersById.get(root.providerId).map(_.`type`)
        List(
          Option.when(providerType.isEmpty)(s"storage root ${root.id} references unknown provider '${root.providerId}'"),
          Option.when(!accountsById.contains(root.accountId))(s"storage root ${root.id} references unknown account '${root.accountId}'"),
          Option.when(providerType.contains("filesystem") && root.path.forall(_.trim.isEmpty))(s"storage root ${root.id}.path is required for filesystem roots"),
          Option.when(providerType.contains("s3") && root.settings.flatMap(_.get("bucket")).forall(_.trim.isEmpty))(s"storage root ${root.id}.settings.bucket is required for S3 roots")
        ).flatten
      }

    providerErrors ++ accountErrors ++ rootErrors
