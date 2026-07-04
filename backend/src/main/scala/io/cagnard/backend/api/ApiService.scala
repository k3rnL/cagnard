package io.cagnard.backend.api

import cats.effect.IO
import io.cagnard.backend.api.ApiModels.given
import io.cagnard.backend.auth.{AccessService, RequestIdentity, UserResolver}
import io.cagnard.backend.config.CagnardConfig
import io.cagnard.backend.storage.{ResolvedStorageRoot, StorageProvider, StorageRegistry}

class ApiService(config: CagnardConfig, registry: StorageRegistry):
  private val userResolver = UserResolver(config)
  private val access = AccessService(config)
  private val previewMaxBytes = 256 * 1024L
  private val defaultTransferMaxBytes = 64L * 1024L * 1024L
  private val providerSettings = config.providers.map(provider => provider.id -> provider.settings.getOrElse(Map.empty)).toMap

  def health: IO[HealthResponse] =
    IO.pure(HealthResponse("ok", stateless = true, providers = config.providers.size, configuredUsers = config.users.size))

  def session(identity: RequestIdentity): IO[Either[ApiError, SessionResponse]] =
    IO.pure {
      userResolver.resolve(identity).map { resolved =>
        sessionFor(resolved)
      }
    }

  def authProviders: IO[Either[ApiError, AuthProvidersResponse]] =
    IO.pure(Right(AuthProvidersResponse(userResolver.providers)))

  def login(request: LoginRequest): IO[Either[ApiError, LoginResult]] =
    IO.pure {
      val username = request.username.map(_.trim).filter(_.nonEmpty)
      val password = request.password.filter(_.nonEmpty)
      val providerEnabled = userResolver.providers.exists(_.id == request.providerId)

      (providerEnabled, username, password) match
        case (false, _, _) => Left(ApiError("authentication_failed", "Invalid username or password"))
        case (true, Some(user), Some(pass)) =>
          userResolver.loginStatic(user, pass).map { case (resolved, token) =>
            LoginResult(LoginResponse(sessionFor(resolved)), userResolver.sessionCookie(token))
          }
        case _ => Left(ApiError("authentication_failed", "Invalid username or password"))
    }

  def logout: IO[LogoutResult] =
    IO.pure(LogoutResult(LogoutResponse(success = true), userResolver.clearSessionCookie))

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

  def transferEntries(identity: RequestIdentity, request: TransferRequest): IO[Either[ApiError, TransferResponse]] =
    IO.pure {
      withWritableRoot(identity, request.destination.tunnel, request.destination.rootId) { destinationRoot =>
        registry.provider(destinationRoot.providerId).map { destinationProvider =>
          val policy = normalizeConflictPolicy(request.conflictPolicy)
          val preflightResults =
            if policy == "fail" then
              request.sources.flatMap(source => preflightTransfer(identity, source, destinationRoot, destinationProvider, request.destination.path))
            else Nil

          if preflightResults.nonEmpty then TransferResponse(success = false, "Transfer needs a conflict decision", preflightResults)
          else
            val results = request.sources.map { source =>
              transferOne(identity, source, destinationRoot, destinationProvider, request.destination.path, policy)
            }
            val success = results.nonEmpty && results.forall(resultSucceeded)
            val completed = results.count(resultSucceeded)
            val conflicted = results.exists(result => result.status == "conflict" || result.children.exists(_.status == "conflict"))
            val message =
              if results.isEmpty then "No entries selected for transfer"
              else if success then s"Transferred $completed item${if completed == 1 then "" else "s"}"
              else if conflicted then "Transfer needs a conflict decision"
              else s"Transferred $completed of ${results.size} item${if results.size == 1 then "" else "s"}"

            TransferResponse(success, message, results)
        }
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

  private case class TransferContext(root: ResolvedStorageRoot, provider: StorageProvider, entry: StorageEntry)
  private case class TargetResolution(path: String, overwrite: Boolean)

  private def preflightTransfer(
      identity: RequestIdentity,
      source: TransferSourceRequest,
      destinationRoot: ResolvedStorageRoot,
      destinationProvider: StorageProvider,
      destinationPath: String
  ): Option[TransferItemResult] =
    normalizeIntent(source.intent) match
      case None => Some(failedResult(source, None, s"Unsupported transfer intent '${source.intent}'"))
      case Some(nextIntent) =>
        sourceContext(identity, source).fold(
          error => Some(failedResult(source.copy(intent = nextIntent), None, error.message)),
          context => {
            val checkedSource = source.copy(intent = nextIntent)
            val targetPath = joinPath(destinationPath, context.entry.name)
            val sameRoot = context.root.tunnel == destinationRoot.tunnel && context.root.id == destinationRoot.id

            if nextIntent == "move" && context.root.readOnly then Some(failedResult(checkedSource, None, "Source root is read-only"))
            else if context.entry.kind != "file" && context.entry.kind != "directory" then Some(failedResult(checkedSource, None, s"Unsupported entry kind '${context.entry.kind}'"))
            else if sameRoot && targetPath == context.entry.path && nextIntent == "move" then Some(failedResult(checkedSource, Some(targetPath), "Source and destination are the same entry"))
            else if sameRoot && context.entry.kind == "directory" && targetPath != context.entry.path && isDescendantPath(targetPath, context.entry.path) then
              Some(failedResult(checkedSource, Some(targetPath), "Cannot transfer a directory into itself"))
            else
              destinationExists(destinationProvider, destinationRoot, targetPath).fold(
                message => Some(failedResult(checkedSource, Some(targetPath), message)),
                exists =>
                  Option.when(exists)(
                    TransferItemResult(checkedSource.intent, checkedSource.tunnel, checkedSource.rootId, checkedSource.path, Some(targetPath), "conflict", s"Target already exists: $targetPath", None)
                  )
              )
          }
        )

  private def transferOne(
      identity: RequestIdentity,
      source: TransferSourceRequest,
      destinationRoot: ResolvedStorageRoot,
      destinationProvider: StorageProvider,
      destinationPath: String,
      conflictPolicy: String
  ): TransferItemResult =
    val intent = normalizeIntent(source.intent)
    intent match
      case None => failedResult(source, None, s"Unsupported transfer intent '${source.intent}'")
      case Some(nextIntent) =>
        sourceContext(identity, source).fold(
          error => failedResult(source, None, error.message),
          context => {
            if nextIntent == "move" && context.root.readOnly then failedResult(source, None, "Source root is read-only")
            else if context.entry.kind != "file" && context.entry.kind != "directory" then failedResult(source, None, s"Unsupported entry kind '${context.entry.kind}'")
            else
              val targetPath = joinPath(destinationPath, context.entry.name)
              val sameRoot = context.root.tunnel == destinationRoot.tunnel && context.root.id == destinationRoot.id

              if sameRoot && targetPath == context.entry.path && (nextIntent == "move" || conflictPolicy == "replace") then
                failedResult(source.copy(intent = nextIntent), Some(targetPath), "Source and destination are the same entry")
              else if sameRoot && context.entry.kind == "directory" && targetPath != context.entry.path && isDescendantPath(targetPath, context.entry.path) then
                failedResult(source.copy(intent = nextIntent), Some(targetPath), "Cannot transfer a directory into itself")
              else if sameRoot && context.entry.kind == "file" then
                transferSameRootFile(source.copy(intent = nextIntent), context, targetPath, conflictPolicy)
              else
                val copied = copyTree(source.copy(intent = "copy"), context.provider, context.root, context.entry, destinationProvider, destinationRoot, targetPath, conflictPolicy)
                if nextIntent == "copy" then copied.copy(intent = "copy")
                else if !resultSucceeded(copied) then copied.copy(intent = "move")
                else
                  deleteRecursive(context.provider, context.root, context.entry.path) match
                    case Right(_) => copied.copy(intent = "move", status = "moved", message = s"Moved to ${copied.targetPath.getOrElse(targetPath)}")
                    case Left(message) => copied.copy(intent = "move", status = "partial", message = s"Copied to ${copied.targetPath.getOrElse(targetPath)}, but source delete failed: $message")
          }
        )

  private def transferSameRootFile(
      source: TransferSourceRequest,
      context: TransferContext,
      targetPath: String,
      conflictPolicy: String
  ): TransferItemResult =
    resolveTarget(source, context.provider, context.root, targetPath, context.entry.kind, conflictPolicy).fold(
      identity,
      target => {
        val operation =
          if source.intent == "move" then context.provider.move(context.root, source.path, target.path, target.overwrite)
          else context.provider.copy(context.root, source.path, target.path, target.overwrite)

        operation.fold(
          message => failedResult(source, Some(target.path), message),
          entry => TransferItemResult(source.intent, source.tunnel, source.rootId, source.path, Some(entry.path), if source.intent == "move" then "moved" else "copied", s"${if source.intent == "move" then "Moved" else "Copied"} to ${entry.path}", Some(entry))
        )
      }
    )

  private def copyTree(
      source: TransferSourceRequest,
      sourceProvider: StorageProvider,
      sourceRoot: ResolvedStorageRoot,
      sourceEntry: StorageEntry,
      destinationProvider: StorageProvider,
      destinationRoot: ResolvedStorageRoot,
      targetPath: String,
      conflictPolicy: String
  ): TransferItemResult =
    resolveTarget(source, destinationProvider, destinationRoot, targetPath, sourceEntry.kind, conflictPolicy).fold(
      identity,
      target => {
        if sourceEntry.kind == "directory" then
          copyDirectory(source, sourceProvider, sourceRoot, sourceEntry, destinationProvider, destinationRoot, target, conflictPolicy)
        else
          copyFile(source, sourceProvider, sourceRoot, destinationProvider, destinationRoot, target)
      }
    )

  private def copyFile(
      source: TransferSourceRequest,
      sourceProvider: StorageProvider,
      sourceRoot: ResolvedStorageRoot,
      destinationProvider: StorageProvider,
      destinationRoot: ResolvedStorageRoot,
      target: TargetResolution
  ): TransferItemResult =
    val transferMaxBytes = configuredTransferMaxBytes(sourceRoot, destinationRoot)
    val copied =
      for
        content <- sourceProvider.download(sourceRoot, source.path)
        _ <- Either.cond(content.bytes.length.toLong <= transferMaxBytes, (), s"File exceeds buffered transfer limit of $transferMaxBytes bytes")
        entry <- destinationProvider.upload(destinationRoot, target.path, content.bytes, target.overwrite)
      yield entry

    copied.fold(
      message => failedResult(source, Some(target.path), message),
      entry => TransferItemResult(source.intent, source.tunnel, source.rootId, source.path, Some(entry.path), "copied", s"Copied to ${entry.path}", Some(entry))
    )

  private def copyDirectory(
      source: TransferSourceRequest,
      sourceProvider: StorageProvider,
      sourceRoot: ResolvedStorageRoot,
      sourceEntry: StorageEntry,
      destinationProvider: StorageProvider,
      destinationRoot: ResolvedStorageRoot,
      target: TargetResolution,
      conflictPolicy: String
  ): TransferItemResult =
    val childEntries = sourceProvider.list(sourceRoot, sourceEntry.path)
    childEntries.fold(
      message => failedResult(source, Some(target.path), message),
      entries =>
        val created =
          destinationProvider.createFolder(destinationRoot, parentPath(target.path), fileName(target.path)).orElse {
            destinationProvider.stat(destinationRoot, target.path)
          }

        created.fold(
          message => failedResult(source, Some(target.path), message),
          directoryEntry => {
            val children = entries.map { child =>
              val childSource = source.copy(path = child.path)
              copyTree(childSource, sourceProvider, sourceRoot, child, destinationProvider, destinationRoot, joinPath(target.path, child.name), conflictPolicy)
            }
            val ok = children.forall(resultSucceeded)
            TransferItemResult(
              source.intent,
              source.tunnel,
              source.rootId,
              source.path,
              Some(directoryEntry.path),
              if ok then "copied" else "failed",
              if ok then s"Copied directory to ${directoryEntry.path}" else s"Directory copy completed with ${children.count(child => !resultSucceeded(child))} failed child item(s)",
              Some(directoryEntry),
              children
            )
          }
        )
    )

  private def resolveTarget(
      source: TransferSourceRequest,
      provider: StorageProvider,
      root: ResolvedStorageRoot,
      targetPath: String,
      sourceKind: String,
      conflictPolicy: String
  ): Either[TransferItemResult, TargetResolution] =
    destinationExists(provider, root, targetPath).fold(
      message => Left(failedResult(source, Some(targetPath), message)),
      exists =>
        if !exists then Right(TargetResolution(targetPath, overwrite = false))
        else
          conflictPolicy match
            case "skip" => Left(TransferItemResult(source.intent, source.tunnel, source.rootId, source.path, Some(targetPath), "skipped", s"Skipped existing target $targetPath", None))
            case "keep-both" =>
              availablePath(provider, root, targetPath, sourceKind).fold(
                message => Left(failedResult(source, Some(targetPath), message)),
                path => Right(TargetResolution(path, overwrite = false))
              )
            case "replace" =>
              if sourceKind == "directory" then
                deleteRecursive(provider, root, targetPath).fold(
                  message => Left(failedResult(source, Some(targetPath), s"Cannot replace existing directory: $message")),
                  _ => Right(TargetResolution(targetPath, overwrite = false))
                )
              else Right(TargetResolution(targetPath, overwrite = true))
            case _ => Left(TransferItemResult(source.intent, source.tunnel, source.rootId, source.path, Some(targetPath), "conflict", s"Target already exists: $targetPath", None))
    )

  private def sourceContext(identity: RequestIdentity, source: TransferSourceRequest): Either[ApiError, TransferContext] =
    withRoot(identity, source.tunnel, source.rootId) { root =>
      for
        provider <- registry.provider(root.providerId)
        entry <- provider.stat(root, source.path).left.map(operationError)
      yield TransferContext(root, provider, entry)
    }

  private def deleteRecursive(provider: StorageProvider, root: ResolvedStorageRoot, path: String): Either[String, Unit] =
    provider.stat(root, path).flatMap { entry =>
      if entry.kind == "directory" then
        val deletedChildren =
          provider.list(root, path).flatMap { children =>
            children.foldLeft[Either[String, Unit]](Right(())) { (acc, child) =>
              acc.flatMap(_ => deleteRecursive(provider, root, child.path))
            }
          }
        deletedChildren.flatMap { _ =>
          provider.delete(root, path) match
            case Right(value) => Right(value)
            case Left(message) if message.contains("Path does not exist") || message.contains("Recursive prefix delete is not supported") => Right(())
            case Left(message) => Left(message)
        }
      else provider.delete(root, path)
    }

  private def destinationExists(provider: StorageProvider, root: ResolvedStorageRoot, path: String): Either[String, Boolean] =
    provider.stat(root, path) match
      case Right(_) => Right(true)
      case Left(message) if message.toLowerCase.contains("does not exist") => Right(false)
      case Left(message) => Left(message)

  private def availablePath(provider: StorageProvider, root: ResolvedStorageRoot, targetPath: String, sourceKind: String): Either[String, String] =
    def candidate(attempt: Int): String =
      val name = fileName(targetPath)
      val parent = parentPath(targetPath)
      val nextName =
        if sourceKind == "file" then copyName(name, attempt)
        else if attempt == 1 then s"$name copy"
        else s"$name copy $attempt"
      joinPath(parent, nextName)

    def loop(attempt: Int): Either[String, String] =
      if attempt > 100 then Left("Could not find a non-conflicting target name")
      else
        val path = candidate(attempt)
        destinationExists(provider, root, path).flatMap {
          case true => loop(attempt + 1)
          case false => Right(path)
        }

    loop(1)

  private def resultSucceeded(result: TransferItemResult): Boolean =
    Set("copied", "moved", "skipped").contains(result.status) && result.children.forall(resultSucceeded)

  private def failedResult(source: TransferSourceRequest, targetPath: Option[String], message: String): TransferItemResult =
    TransferItemResult(source.intent, source.tunnel, source.rootId, source.path, targetPath, "failed", message, None)

  private def normalizeIntent(intent: String): Option[String] =
    Option(intent).map(_.trim.toLowerCase).filter(value => value == "copy" || value == "move")

  private def normalizeConflictPolicy(policy: String): String =
    Option(policy).map(_.trim.toLowerCase).filter(Set("fail", "skip", "keep-both", "replace")).getOrElse("fail")

  private def configuredTransferMaxBytes(sourceRoot: ResolvedStorageRoot, destinationRoot: ResolvedStorageRoot): Long =
    List(sourceRoot, destinationRoot)
      .flatMap(root =>
        List(
          root.settings.get("maxBufferedObjectBytes"),
          providerSettings.get(root.providerId).flatMap(_.get("maxBufferedObjectBytes"))
        ).flatten
      )
      .flatMap(_.trim.toLongOption.filter(_ > 0))
      .minOption
      .getOrElse(defaultTransferMaxBytes)

  private def isDescendantPath(path: String, ancestor: String): Boolean =
    val cleanPath = Option(path).getOrElse("").stripPrefix("/").stripSuffix("/")
    val cleanAncestor = Option(ancestor).getOrElse("").stripPrefix("/").stripSuffix("/")
    cleanAncestor.nonEmpty && cleanPath.startsWith(s"$cleanAncestor/")

  private def parentPath(path: String): String =
    Option(path).getOrElse("").split("/").filter(_.nonEmpty).dropRight(1).mkString("/")

  private def fileName(path: String): String =
    Option(path).getOrElse("").split("/").filter(_.nonEmpty).lastOption.getOrElse("")

  private def joinPath(parent: String, name: String): String =
    val cleanParent = Option(parent).getOrElse("").stripPrefix("/").stripSuffix("/")
    val cleanName = Option(name).getOrElse("").stripPrefix("/")
    if cleanParent.isEmpty then cleanName else s"$cleanParent/$cleanName"

  private def copyName(name: String, attempt: Int): String =
    val suffix = if attempt == 1 then "copy" else s"copy $attempt"
    val dot = name.lastIndexOf(".")
    if dot > 0 && dot < name.length - 1 then s"${name.take(dot)} $suffix${name.drop(dot)}"
    else s"$name $suffix"

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

  private def sessionFor(resolved: io.cagnard.backend.auth.ResolvedUser): SessionResponse =
    val personal = access.personalRoots(resolved.profile)
    val global = access.globalRoots(resolved.profile)
    SessionResponse(
      user = resolved.profile,
      authMode = resolved.authMode,
      personalEnabled = personal.nonEmpty,
      globalEnabled = global.nonEmpty
    )

  extension [A, B](values: List[A])
    private def traverse(f: A => Either[ApiError, B]): Either[ApiError, List[B]] =
      values.foldRight[Either[ApiError, List[B]]](Right(Nil)) { (value, acc) =>
        for
          head <- f(value)
          tail <- acc
        yield head :: tail
      }

case class LoginResult(response: LoginResponse, setCookie: String)

case class LogoutResult(response: LogoutResponse, setCookie: String)
