package io.cagnard.backend.api

import cats.effect.IO
import io.cagnard.backend.api.ApiModels.given
import io.cagnard.backend.auth.{AccessService, RequestIdentity, UserResolver}
import io.cagnard.backend.config.CagnardConfig
import io.cagnard.backend.storage.{ResolvedStorageRoot, StorageRegistry}

class ApiService(config: CagnardConfig, registry: StorageRegistry):
  private val userResolver = UserResolver(config)
  private val access = AccessService(config)
  private val previewMaxBytes = 256 * 1024L

  def health: IO[HealthResponse] =
    IO.pure(HealthResponse("ok", stateless = true, providers = config.providers.size, configuredUsers = config.users.size))

  def session(identity: RequestIdentity): IO[Either[ApiError, SessionResponse]] =
    IO.pure {
      userResolver.resolve(identity).map { resolved =>
        val personal = access.personalRoots(resolved.profile)
        val global = access.globalRoots(resolved.profile)
        SessionResponse(
          user = resolved.profile,
          authMode = resolved.authMode,
          personalEnabled = personal.nonEmpty,
          globalEnabled = global.nonEmpty
        )
      }
    }

  def navigation(identity: RequestIdentity): IO[Either[ApiError, NavigationResponse]] =
    IO.pure {
      userResolver.resolve(identity).flatMap { resolved =>
        val personal = access.personalRoots(resolved.profile).traverse(registry.toNavigationRoot)
        val global = access.globalRoots(resolved.profile).traverse(registry.toNavigationRoot)

        for
          personalRoots <- personal
          globalRoots <- global
        yield NavigationResponse(
          personal = Option.when(personalRoots.nonEmpty)(NavigationSection("Home", personalRoots)),
          global = Option.when(globalRoots.nonEmpty)(NavigationSection("Global", globalRoots))
        )
      }
    }

  def listEntries(identity: RequestIdentity, tunnel: String, rootId: String, path: String): IO[Either[ApiError, EntryListResponse]] =
    IO.pure {
      withRoot(identity, tunnel, rootId) { root =>
        for
          provider <- registry.provider(root.providerId)
          navRoot <- registry.toNavigationRoot(root)
          entries <- provider.list(root, path).left.map(message => ApiError("storage_list_failed", message))
        yield EntryListResponse(navRoot, path, entries)
      }
    }

  def statEntry(identity: RequestIdentity, tunnel: String, rootId: String, path: String): IO[Either[ApiError, StorageEntry]] =
    IO.pure {
      withRoot(identity, tunnel, rootId) { root =>
        for
          provider <- registry.provider(root.providerId)
          entry <- provider.stat(root, path).left.map(message => ApiError("storage_stat_failed", message))
        yield entry
      }
    }

  def downloadContent(identity: RequestIdentity, tunnel: String, rootId: String, path: String) =
    IO.pure {
      withRoot(identity, tunnel, rootId) { root =>
        for
          provider <- registry.provider(root.providerId)
          content <- provider.download(root, path).left.map(message => ApiError("storage_download_failed", message))
        yield content
      }
    }

  def previewContent(identity: RequestIdentity, tunnel: String, rootId: String, path: String): IO[Either[ApiError, PreviewResponse]] =
    IO.pure {
      withRoot(identity, tunnel, rootId) { root =>
        for
          provider <- registry.provider(root.providerId)
          preview <- provider.preview(root, path, previewMaxBytes).left.map(message => ApiError("storage_preview_failed", message))
        yield PreviewResponse(preview.path, preview.mimeType, preview.content, preview.truncated)
      }
    }

  def uploadContent(identity: RequestIdentity, tunnel: String, rootId: String, path: String, overwrite: Boolean, bytes: Array[Byte]): IO[Either[ApiError, OperationResponse]] =
    IO.pure {
      withWritableRoot(identity, tunnel, rootId) { root =>
        for
          provider <- registry.provider(root.providerId)
          entry <- provider.upload(root, path, bytes, overwrite).left.map(operationError)
        yield OperationResponse(success = true, s"Uploaded ${entry.name}", Some(entry))
      }
    }

  def createFolder(identity: RequestIdentity, request: CreateFolderRequest): IO[Either[ApiError, OperationResponse]] =
    IO.pure {
      withWritableRoot(identity, request.tunnel, request.rootId) { root =>
        for
          provider <- registry.provider(root.providerId)
          entry <- provider.createFolder(root, request.parentPath, request.name).left.map(operationError)
        yield OperationResponse(success = true, s"Created folder ${entry.name}", Some(entry))
      }
    }

  def renameEntry(identity: RequestIdentity, request: RenameEntryRequest): IO[Either[ApiError, OperationResponse]] =
    IO.pure {
      withWritableRoot(identity, request.tunnel, request.rootId) { root =>
        for
          provider <- registry.provider(root.providerId)
          entry <- provider.rename(root, request.path, request.newName).left.map(operationError)
        yield OperationResponse(success = true, s"Renamed to ${entry.name}", Some(entry))
      }
    }

  def deleteEntry(identity: RequestIdentity, request: DeleteEntryRequest): IO[Either[ApiError, OperationResponse]] =
    IO.pure {
      if !request.confirmed then Left(ApiError("confirmation_required", "Delete requires explicit confirmation"))
      else
        withWritableRoot(identity, request.tunnel, request.rootId) { root =>
          for
            provider <- registry.provider(root.providerId)
            _ <- provider.delete(root, request.path).left.map(operationError)
          yield OperationResponse(success = true, s"Deleted ${request.path}", None)
        }
    }

  def copyEntry(identity: RequestIdentity, request: CopyEntryRequest): IO[Either[ApiError, OperationResponse]] =
    IO.pure {
      withWritableRoot(identity, request.tunnel, request.rootId) { root =>
        for
          provider <- registry.provider(root.providerId)
          entry <- provider.copy(root, request.sourcePath, request.targetPath, request.overwrite).left.map(operationError)
        yield OperationResponse(success = true, s"Copied to ${entry.path}", Some(entry))
      }
    }

  def moveEntry(identity: RequestIdentity, request: MoveEntryRequest): IO[Either[ApiError, OperationResponse]] =
    IO.pure {
      withWritableRoot(identity, request.tunnel, request.rootId) { root =>
        for
          provider <- registry.provider(root.providerId)
          entry <- provider.move(root, request.sourcePath, request.targetPath, request.overwrite).left.map(operationError)
        yield OperationResponse(success = true, s"Moved to ${entry.path}", Some(entry))
      }
    }

  def uiPlugins(identity: RequestIdentity): IO[Either[ApiError, UiPluginsResponse]] =
    IO.pure {
      userResolver.resolve(identity).map { _ =>
        UiPluginsResponse(
          config.uiPlugins
            .filter(_.enabled)
            .sortBy(_.priority)
            .map(plugin =>
              UiPluginManifest(
                id = plugin.id,
                label = plugin.label,
                kind = plugin.kind,
                apiVersion = plugin.apiVersion,
                mimeTypes = plugin.mimeTypes.getOrElse(Nil),
                extensions = plugin.extensions.getOrElse(Nil),
                permissions = plugin.permissions.getOrElse(Nil),
                priority = plugin.priority
              )
            )
        )
      }
    }

  private def withRoot[A](identity: RequestIdentity, tunnel: String, rootId: String)(use: ResolvedStorageRoot => Either[ApiError, A]): Either[ApiError, A] =
    userResolver.resolve(identity).flatMap { resolved =>
      val roots =
        tunnel match
          case "personal" => Right(access.personalRoots(resolved.profile))
          case "global" => Right(access.globalRoots(resolved.profile))
          case other => Left(ApiError("unknown_tunnel", s"Unknown storage tunnel '$other'"))

      roots.flatMap(_.find(_.id == rootId).toRight(ApiError("unknown_root", s"Storage root '$rootId' is not available")).flatMap(use))
    }

  private def withWritableRoot[A](identity: RequestIdentity, tunnel: String, rootId: String)(use: ResolvedStorageRoot => Either[ApiError, A]): Either[ApiError, A] =
    withRoot(identity, tunnel, rootId) { root =>
      if root.readOnly then Left(ApiError("read_only_root", "Storage root is read-only"))
      else use(root)
    }

  private def operationError(message: String): ApiError =
    val code =
      if message.toLowerCase.contains("already exists") then "target_conflict"
      else if message.toLowerCase.contains("escapes configured storage root") then "invalid_path"
      else if message.toLowerCase.contains("read-only") then "read_only_root"
      else "storage_operation_failed"
    ApiError(code, message)

  extension [A, B](values: List[A])
    private def traverse(f: A => Either[ApiError, B]): Either[ApiError, List[B]] =
      values.foldRight[Either[ApiError, List[B]]](Right(Nil)) { (value, acc) =>
        for
          head <- f(value)
          tail <- acc
        yield head :: tail
      }
