package io.cagnard.backend.storage

import io.cagnard.backend.api.{ApiError, NavigationRoot}
import io.cagnard.backend.config.CagnardConfig

case class StorageRegistry(providers: Map[String, StorageProvider]):
  def provider(id: String): Either[ApiError, StorageProvider] =
    providers.get(id).toRight(ApiError("unknown_provider", s"Provider '$id' is not registered"))

  def toNavigationRoot(root: ResolvedStorageRoot): Either[ApiError, NavigationRoot] =
    provider(root.providerId).map { storageProvider =>
      NavigationRoot(
        id = root.id,
        label = root.label,
        tunnel = root.tunnel,
        providerId = root.providerId,
        accountId = root.accountId,
        providerFamily = root.providerFamily,
        readOnly = root.readOnly,
        capabilities = storageProvider.capabilities(root)
      )
    }

object StorageRegistry:
  def fromConfig(config: CagnardConfig): Either[Throwable, StorageRegistry] =
    val providers = config.providers.map { providerConfig =>
      val provider: Either[Throwable, StorageProvider] =
        providerConfig.`type` match
          case "filesystem" => Right(FilesystemProvider(providerConfig))
          case "s3" => S3StorageProvider.fromConfig(providerConfig, config.accounts.filter(_.providerId == providerConfig.id))
          case other => Left(IllegalArgumentException(s"Unsupported provider type '$other' for provider '${providerConfig.id}'"))

      provider.map(providerConfig.id -> _)
    }

    providers.foldLeft[Either[Throwable, Map[String, StorageProvider]]](Right(Map.empty)) {
      case (Right(acc), Right((id, provider))) => Right(acc + (id -> provider))
      case (Left(error), _) => Left(error)
      case (_, Left(error)) => Left(error)
    }.map(StorageRegistry(_))
