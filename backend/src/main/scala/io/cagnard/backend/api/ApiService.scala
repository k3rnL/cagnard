package io.cagnard.backend.api

import cats.effect.IO
import io.cagnard.backend.api.ApiModels.given
import io.cagnard.backend.auth.{AccessService, RequestIdentity, UserResolver}
import io.cagnard.backend.config.CagnardConfig
import io.cagnard.backend.storage.{FileContentInfo, ResolvedStorageRoot, StorageProvider, StorageRegistry}

import java.io.{PipedInputStream, PipedOutputStream}
import java.time.Instant
import java.util.UUID
import java.util.concurrent.{Callable, ConcurrentHashMap, Executors}
import java.util.concurrent.atomic.AtomicLong
import scala.jdk.CollectionConverters.*
import scala.util.control.NonFatal

class ApiService(config: CagnardConfig, registry: StorageRegistry):
  private val userResolver = UserResolver(config)
  private val access = AccessService(config)
  private val previewMaxBytes = 256 * 1024L
  private val defaultTransferMaxBytes = 64L * 1024L * 1024L
  private val providerSettings = config.providers.map(provider => provider.id -> provider.settings.getOrElse(Map.empty)).toMap
  private val transferJobs = new ConcurrentHashMap[String, StoredTransferJob]()
  private val canceledTransferJobs = ConcurrentHashMap.newKeySet[String]()

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
            val conflicted = results.exists(hasConflict)
            val message =
              if results.isEmpty then "No entries selected for transfer"
              else if success then s"Transferred $completed item${if completed == 1 then "" else "s"}"
              else if conflicted then "Transfer needs a conflict decision"
              else s"Transferred $completed of ${results.size} item${if results.size == 1 then "" else "s"}"

            TransferResponse(success, message, results)
        }
      }
    }

  def startTransferJob(identity: RequestIdentity, request: TransferRequest): IO[Either[ApiError, TransferJobResponse]] =
    userResolver.resolve(identity) match
      case Left(error) => IO.pure(Left(error))
      case Right(resolved) =>
        IO.delay {
          withWritableRoot(identity, request.destination.tunnel, request.destination.rootId) { destinationRoot =>
            registry.provider(destinationRoot.providerId).map { destinationProvider =>
              val policy = normalizeConflictPolicy(request.conflictPolicy)
              val now = nowString
              val jobId = UUID.randomUUID().toString
              val initialTasks = request.sources.zipWithIndex.map { case (source, index) =>
                transferTask(index, source, phase = "planned", status = "queued", message = "Waiting to start", targetPath = None, result = None)
              }
              val preflightResults =
                if policy == "fail" then
                  request.sources.flatMap(source => preflightTransfer(identity, source, destinationRoot, destinationProvider, request.destination.path))
                else Nil
              val initialStatus =
                if request.sources.isEmpty then "failed"
                else if preflightResults.nonEmpty then "blocked"
                else "queued"
              val initialMessage =
                if request.sources.isEmpty then "No entries selected for transfer"
                else if preflightResults.nonEmpty then "Transfer needs a conflict decision"
                else "Transfer job queued"
              val initialResults = preflightResults
              val initialJob = TransferJobResponse(
                id = jobId,
                status = initialStatus,
                message = initialMessage,
                createdAt = now,
                updatedAt = now,
                operation = operationName(request.sources),
                destination = request.destination,
                conflictPolicy = policy,
                tasks = if preflightResults.nonEmpty then tasksFromResults(request.sources, preflightResults) else initialTasks,
                results = initialResults
              )
              transferJobs.put(jobId, StoredTransferJob(resolved.profile.id, initialJob))
              (initialJob, destinationRoot, destinationProvider, policy, preflightResults)
            }
          }
        }.flatMap {
          case Left(error) => IO.pure(Left(error))
          case Right((job, destinationRoot, destinationProvider, policy, preflightResults)) =>
            if preflightResults.nonEmpty || request.sources.isEmpty then IO.pure(Right(job))
            else
              runTransferJob(job.id, identity, request, destinationRoot, destinationProvider, policy).start.as(Right(job))
        }

  def transferJob(identity: RequestIdentity, jobId: String): IO[Either[ApiError, TransferJobResponse]] =
    IO.pure {
      userResolver.resolve(identity).flatMap { resolved =>
        Option(transferJobs.get(jobId)) match
          case Some(stored) if stored.ownerId == resolved.profile.id => Right(stored.job)
          case Some(_) => Left(ApiError("not_found", "Transfer job was not found"))
          case None => Left(ApiError("not_found", "Transfer job was not found"))
      }
    }

  def transferJobList(identity: RequestIdentity): IO[Either[ApiError, TransferJobListResponse]] =
    IO.pure {
      userResolver.resolve(identity).map { resolved =>
        val jobs = transferJobs
          .values()
          .asScala
          .toList
          .filter(_.ownerId == resolved.profile.id)
          .map(_.job)
          .sortBy(_.createdAt)
          .reverse
        TransferJobListResponse(jobs)
      }
    }

  def cancelTransferJob(identity: RequestIdentity, jobId: String): IO[Either[ApiError, TransferJobResponse]] =
    IO.pure {
      userResolver.resolve(identity).flatMap { resolved =>
        Option(transferJobs.get(jobId)) match
          case Some(stored) if stored.ownerId == resolved.profile.id =>
            canceledTransferJobs.add(jobId)
            val updated =
              if terminalJobStatuses.contains(stored.job.status) then stored.job
              else stored.job.copy(status = "canceling", message = "Cancellation requested", updatedAt = nowString)
            transferJobs.put(jobId, stored.copy(job = updated))
            Right(updated)
          case _ => Left(ApiError("not_found", "Transfer job was not found"))
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
  private case class StoredTransferJob(ownerId: String, job: TransferJobResponse)
  private case class TransferJobContext(jobId: String, taskIndex: Int)

  private val terminalJobStatuses = Set("completed", "failed", "canceled", "partial", "blocked")

  private def runTransferJob(
      jobId: String,
      identity: RequestIdentity,
      request: TransferRequest,
      destinationRoot: ResolvedStorageRoot,
      destinationProvider: StorageProvider,
      conflictPolicy: String
  ): IO[Unit] =
    IO.blocking {
      updateJob(jobId)(job => job.copy(status = "running", message = "Transfer job running", updatedAt = nowString))
      val results = request.sources.zipWithIndex.map { case (source, index) =>
        if isCanceled(jobId) then
          val canceled = failedResult(source, None, "Transfer job was canceled").copy(status = "canceled")
          updateJobTask(jobId, index, "canceled", "canceled", "Canceled before start", Some(canceled))
          canceled
        else
          updateJobTask(jobId, index, "running", "running", "Transfer task running", None)
          val result =
            try transferOne(identity, source, destinationRoot, destinationProvider, request.destination.path, conflictPolicy, Some(TransferJobContext(jobId, index)))
            catch
              case NonFatal(error) => failedResult(source, None, safeExceptionMessage(error))
          val conflicted = hasConflict(result)
          val phase =
            result.status match
              case "copied" | "moved" | "skipped" => "completed"
              case "canceled" => "canceled"
              case "partial" => "partial"
              case _ if conflicted => "blocked"
              case _ => "failed"
          updateJobTask(jobId, index, phase, if conflicted then "blocked" else result.status, result.message, Some(result))
          result
      }
      val success = results.nonEmpty && results.forall(resultSucceeded)
      val completed = results.count(resultSucceeded)
      val canceled = results.exists(_.status == "canceled") || isCanceled(jobId)
      val conflicted = results.exists(hasConflict)
      val finalStatus =
        if canceled then "canceled"
        else if success then "completed"
        else if conflicted then "blocked"
        else if completed > 0 then "partial"
        else "failed"
      val message =
        if results.isEmpty then "No entries selected for transfer"
        else if finalStatus == "completed" then s"Transferred $completed item${if completed == 1 then "" else "s"}"
        else if finalStatus == "canceled" then "Transfer job canceled"
        else if finalStatus == "blocked" then "Transfer needs a conflict decision"
        else s"Transferred $completed of ${results.size} item${if results.size == 1 then "" else "s"}"
      updateJob(jobId)(_.copy(status = finalStatus, message = message, updatedAt = nowString, results = results))
    }.void

  private def updateJob(jobId: String)(update: TransferJobResponse => TransferJobResponse): Unit =
    Option(transferJobs.get(jobId)).foreach { stored =>
      transferJobs.put(jobId, stored.copy(job = update(stored.job)))
    }

  private def updateJobTask(jobId: String, index: Int, phase: String, status: String, message: String, result: Option[TransferItemResult]): Unit =
    updateJob(jobId) { job =>
      val nextTasks = job.tasks.zipWithIndex.map { case (task, currentIndex) =>
        if currentIndex == index then
          task.copy(
            phase = phase,
            status = status,
            message = message,
            targetPath = result.flatMap(_.targetPath).orElse(task.targetPath),
            result = result,
            children = result.map(resultToTaskChildren(task.id, _)).getOrElse(task.children)
          )
        else task
      }
      job.copy(tasks = nextTasks, updatedAt = nowString)
    }

  private def updateJobTaskProgress(jobId: String, index: Int, bytesTransferred: Long, totalBytes: Option[Long], itemsCompleted: Int): Unit =
    updateJob(jobId) { job =>
      val nextTasks = job.tasks.zipWithIndex.map { case (task, currentIndex) =>
        if currentIndex == index then
          task.copy(
            phase = if task.phase == "planned" || task.phase == "queued" then "running" else task.phase,
            status = if task.status == "queued" then "running" else task.status,
            progress = task.progress.copy(
              bytesTransferred = bytesTransferred,
              totalBytes = totalBytes.orElse(task.progress.totalBytes),
              itemsCompleted = itemsCompleted
            )
          )
        else task
      }
      job.copy(tasks = nextTasks, updatedAt = nowString)
    }

  private def tasksFromResults(sources: List[TransferSourceRequest], results: List[TransferItemResult]): List[TransferJobTask] =
    sources.zipWithIndex.map { case (source, index) =>
      results.find(result => result.sourceTunnel == source.tunnel && result.sourceRootId == source.rootId && result.sourcePath == source.path) match
        case Some(result) =>
          val status = if hasConflict(result) && result.status != "conflict" then "blocked" else result.status
          transferTask(index, source, status, status, result.message, result.targetPath, Some(result))
        case None =>
          transferTask(index, source, "planned", "queued", "Waiting to start", None, None)
    }

  private def resultToTaskChildren(parentId: String, result: TransferItemResult): List[TransferJobTask] =
    result.children.zipWithIndex.map { case (child, index) =>
      TransferJobTask(
        id = s"$parentId.${index + 1}",
        intent = child.intent,
        sourceTunnel = child.sourceTunnel,
        sourceRootId = child.sourceRootId,
        sourcePath = child.sourcePath,
        targetPath = child.targetPath,
        phase = child.status,
        status = child.status,
        message = child.message,
        progress = TransferTaskProgress(0L, child.entry.flatMap(_.metadata.size), if resultSucceeded(child) then 1 else 0, Some(1)),
        result = Some(child),
        children = resultToTaskChildren(s"$parentId.${index + 1}", child)
      )
    }

  private def transferTask(
      index: Int,
      source: TransferSourceRequest,
      phase: String,
      status: String,
      message: String,
      targetPath: Option[String],
      result: Option[TransferItemResult]
  ): TransferJobTask =
    TransferJobTask(
      id = s"task-${index + 1}",
      intent = source.intent,
      sourceTunnel = source.tunnel,
      sourceRootId = source.rootId,
      sourcePath = source.path,
      targetPath = targetPath,
      phase = phase,
      status = status,
      message = message,
      progress = TransferTaskProgress(0L, result.flatMap(_.entry).flatMap(_.metadata.size), result.filter(resultSucceeded).map(_ => 1).getOrElse(0), Some(1)),
      result = result,
      children = result.map(resultToTaskChildren(s"task-${index + 1}", _)).getOrElse(Nil)
    )

  private def operationName(sources: List[TransferSourceRequest]): String =
    val intents = sources.map(source => normalizeIntent(source.intent).getOrElse(source.intent)).distinct
    if intents.size == 1 then intents.headOption.getOrElse("transfer") else "mixed"

  private def isCanceled(jobId: String): Boolean =
    canceledTransferJobs.contains(jobId)

  private def nowString: String =
    Instant.now().toString

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
              preflightTarget(
                checkedSource,
                context.provider,
                context.root,
                context.entry,
                destinationProvider,
                destinationRoot,
                targetPath
              )
          }
        )

  private def preflightTarget(
      source: TransferSourceRequest,
      sourceProvider: StorageProvider,
      sourceRoot: ResolvedStorageRoot,
      sourceEntry: StorageEntry,
      destinationProvider: StorageProvider,
      destinationRoot: ResolvedStorageRoot,
      targetPath: String
  ): Option[TransferItemResult] =
    destinationExists(destinationProvider, destinationRoot, targetPath).fold(
      message => Some(failedResult(source, Some(targetPath), message)),
      exists =>
        if exists then Some(conflictResult(source, targetPath))
        else if sourceEntry.kind == "directory" then
          sourceProvider.list(sourceRoot, sourceEntry.path).fold(
            message => Some(failedResult(source, Some(targetPath), message)),
            entries =>
              entries.iterator
                .map { child =>
                  preflightTarget(
                    source.copy(path = child.path),
                    sourceProvider,
                    sourceRoot,
                    child,
                    destinationProvider,
                    destinationRoot,
                    joinPath(targetPath, child.name)
                  )
                }
                .collectFirst { case Some(result) => result }
                .map { childConflict =>
                  failedResult(source, Some(targetPath), "Directory contains conflicting destination item(s)").copy(children = List(childConflict))
                }
          )
        else None
    )

  private def transferOne(
      identity: RequestIdentity,
      source: TransferSourceRequest,
      destinationRoot: ResolvedStorageRoot,
      destinationProvider: StorageProvider,
      destinationPath: String,
      conflictPolicy: String,
      jobContext: Option[TransferJobContext] = None
  ): TransferItemResult =
    val intent = normalizeIntent(source.intent)
    intent match
      case None => failedResult(source, None, s"Unsupported transfer intent '${source.intent}'")
      case Some(nextIntent) =>
        sourceContext(identity, source).fold(
          error => failedResult(source, None, error.message),
          context => {
            if jobContext.exists(context => isCanceled(context.jobId)) then failedResult(source.copy(intent = nextIntent), None, "Transfer job was canceled").copy(status = "canceled")
            else if nextIntent == "move" && context.root.readOnly then failedResult(source, None, "Source root is read-only")
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
                val copied = copyTree(source.copy(intent = "copy"), context.provider, context.root, context.entry, destinationProvider, destinationRoot, targetPath, conflictPolicy, jobContext)
                if nextIntent == "copy" then copied.copy(intent = "copy")
                else if !resultSucceeded(copied) then copied.copy(intent = "move")
                else if jobContext.exists(context => isCanceled(context.jobId)) then
                  copied.copy(intent = "move", status = "canceled", message = s"Transfer job was canceled after destination copy; source was not deleted")
                else
                  context.provider.delete(context.root, context.entry.path) match
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
      conflictPolicy: String,
      jobContext: Option[TransferJobContext]
  ): TransferItemResult =
    resolveTarget(source, destinationProvider, destinationRoot, targetPath, sourceEntry.kind, conflictPolicy).fold(
      identity,
      target => {
        if jobContext.exists(context => isCanceled(context.jobId)) then failedResult(source, Some(target.path), "Transfer job was canceled").copy(status = "canceled")
        else
        if sourceEntry.kind == "directory" then
          copyDirectory(source, sourceProvider, sourceRoot, sourceEntry, destinationProvider, destinationRoot, target, conflictPolicy, jobContext)
        else
          copyFile(source, sourceProvider, sourceRoot, destinationProvider, destinationRoot, target, jobContext)
      }
    )

  private def copyFile(
      source: TransferSourceRequest,
      sourceProvider: StorageProvider,
      sourceRoot: ResolvedStorageRoot,
      destinationProvider: StorageProvider,
      destinationRoot: ResolvedStorageRoot,
      target: TargetResolution,
      jobContext: Option[TransferJobContext]
  ): TransferItemResult =
    val copied =
      if sourceProvider.supportsStreamRead(sourceRoot) && destinationProvider.supportsStreamWrite(destinationRoot) then
        streamCopyFile(source, sourceProvider, sourceRoot, destinationProvider, destinationRoot, target, jobContext)
      else
        bufferedCopyFile(source, sourceProvider, sourceRoot, destinationProvider, destinationRoot, target, jobContext)

    copied.fold(
      message =>
        val status = if message.toLowerCase.contains("canceled") then "canceled" else "failed"
        failedResult(source, Some(target.path), message).copy(status = status),
      entry => TransferItemResult(source.intent, source.tunnel, source.rootId, source.path, Some(entry.path), "copied", s"Copied to ${entry.path}", Some(entry))
    )

  private def bufferedCopyFile(
      source: TransferSourceRequest,
      sourceProvider: StorageProvider,
      sourceRoot: ResolvedStorageRoot,
      destinationProvider: StorageProvider,
      destinationRoot: ResolvedStorageRoot,
      target: TargetResolution,
      jobContext: Option[TransferJobContext]
  ): Either[String, StorageEntry] =
    val maxBytes = configuredTransferMaxBytes(sourceRoot, destinationRoot)
    for
      info <- sourceProvider.contentInfo(sourceRoot, source.path)
      _ <- info.size match
        case Some(size) if size > maxBytes => Left(s"File exceeds buffered transfer limit of $maxBytes bytes and no streaming transfer path is available")
        case _ => Right(())
      content <- sourceProvider.download(sourceRoot, source.path)
      actualSize = content.bytes.length.toLong
      _ <- Either.cond(actualSize <= maxBytes, (), s"File exceeds buffered transfer limit of $maxBytes bytes and no streaming transfer path is available")
      _ = jobContext.foreach(context => updateJobTaskProgress(context.jobId, context.taskIndex, actualSize, Some(actualSize), 0))
      entry <- destinationProvider.upload(destinationRoot, target.path, content.bytes, target.overwrite)
      verified <- verifyWrittenEntry(FileContentInfo(content.fileName, content.mimeType, Some(actualSize)), entry)
    yield verified

  private def streamCopyFile(
      source: TransferSourceRequest,
      sourceProvider: StorageProvider,
      sourceRoot: ResolvedStorageRoot,
      destinationProvider: StorageProvider,
      destinationRoot: ResolvedStorageRoot,
      target: TargetResolution,
      jobContext: Option[TransferJobContext]
  ): Either[String, StorageEntry] =
    sourceProvider.contentInfo(sourceRoot, source.path).flatMap { info =>
      val transferred = AtomicLong(0L)
      val input = PipedInputStream(64 * 1024)
      val output = PipedOutputStream(input)
      val executor = Executors.newSingleThreadExecutor()
      val readFuture = executor.submit(new Callable[Either[String, FileContentInfo]]:
        override def call(): Either[String, FileContentInfo] =
          try sourceProvider.streamRead(sourceRoot, source.path, output, _ => ())
          catch
            case NonFatal(error) => Left(safeExceptionMessage(error))
          finally closeQuietly(output)
      )

      try
        val writeResult =
          try
            destinationProvider
              .streamWrite(
                destinationRoot,
                target.path,
                input,
                info,
                target.overwrite,
                bytes => {
                  val total = transferred.addAndGet(bytes)
                  jobContext.foreach { context =>
                    if isCanceled(context.jobId) then throw RuntimeException("Transfer job was canceled")
                    updateJobTaskProgress(context.jobId, context.taskIndex, total, info.size, 0)
                  }
                }
              )
              .flatMap(entry => verifyWrittenEntry(info, entry))
          catch
            case NonFatal(error) => Left(safeExceptionMessage(error))
          finally closeQuietly(input)

        val readResult =
          try readFuture.get()
          catch
            case NonFatal(error) => Left(safeExceptionMessage(error))

        val result =
          (readResult, writeResult) match
            case (Right(_), Right(entry)) => Right(entry)
            case (Left(message), Right(_)) => Left(message)
            case (_, Left(message)) => Left(message)

        result.left.foreach(_ => cleanupPartialDestination(destinationProvider, destinationRoot, target))
        result
      finally executor.shutdown()
    }

  private def verifyWrittenEntry(info: FileContentInfo, entry: StorageEntry): Either[String, StorageEntry] =
    (info.size, entry.metadata.size) match
      case (Some(expected), Some(actual)) if expected != actual => Left(s"Destination size verification failed: expected $expected bytes, found $actual bytes")
      case _ => Right(entry)

  private def cleanupPartialDestination(provider: StorageProvider, root: ResolvedStorageRoot, target: TargetResolution): Unit =
    if !target.overwrite then provider.delete(root, target.path).foreach(_ => ())

  private def closeQuietly(closeable: AutoCloseable): Unit =
    try closeable.close()
    catch
      case NonFatal(_) => ()

  private def copyDirectory(
      source: TransferSourceRequest,
      sourceProvider: StorageProvider,
      sourceRoot: ResolvedStorageRoot,
      sourceEntry: StorageEntry,
      destinationProvider: StorageProvider,
      destinationRoot: ResolvedStorageRoot,
      target: TargetResolution,
      conflictPolicy: String,
      jobContext: Option[TransferJobContext]
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
              copyTree(childSource, sourceProvider, sourceRoot, child, destinationProvider, destinationRoot, joinPath(target.path, child.name), conflictPolicy, jobContext)
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
                provider.delete(root, targetPath).fold(
                  message => Left(failedResult(source, Some(targetPath), s"Cannot replace existing directory: $message")),
                  _ => Right(TargetResolution(targetPath, overwrite = false))
                )
              else Right(TargetResolution(targetPath, overwrite = true))
            case _ => Left(conflictResult(source, targetPath))
    )

  private def sourceContext(identity: RequestIdentity, source: TransferSourceRequest): Either[ApiError, TransferContext] =
    withRoot(identity, source.tunnel, source.rootId) { root =>
      for
        provider <- registry.provider(root.providerId)
        entry <- provider.stat(root, source.path).left.map(operationError)
      yield TransferContext(root, provider, entry)
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

  private def hasConflict(result: TransferItemResult): Boolean =
    result.status == "conflict" || result.children.exists(hasConflict)

  private def conflictResult(source: TransferSourceRequest, targetPath: String): TransferItemResult =
    TransferItemResult(source.intent, source.tunnel, source.rootId, source.path, Some(targetPath), "conflict", s"Target already exists: $targetPath", None)

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

  private def safeExceptionMessage(error: Throwable): String =
    val cause = Option(error.getCause).getOrElse(error)
    Option(cause.getMessage).map(_.trim).filter(_.nonEmpty).getOrElse(cause.getClass.getSimpleName)

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
