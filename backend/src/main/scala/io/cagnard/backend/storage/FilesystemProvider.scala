package io.cagnard.backend.storage

import io.cagnard.backend.api.StorageEntry
import io.cagnard.backend.config.ProviderConfig

import java.nio.charset.StandardCharsets
import java.nio.file.attribute.PosixFilePermissions
import java.nio.file.{Files, Path, StandardCopyOption}
import scala.jdk.CollectionConverters.*
import scala.util.Try

class FilesystemProvider(config: ProviderConfig) extends StorageProvider:
  override val descriptor: ProviderDescriptor =
    ProviderDescriptor(config.id, config.family, config.displayName, config.`type`)

  override def capabilities(root: ResolvedStorageRoot) =
    StorageCapabilities.filesystem(root.readOnly)

  override def list(root: ResolvedStorageRoot, path: String): Either[String, List[StorageEntry]] =
    resolve(root, path).flatMap { target =>
      if !Files.exists(target) then Left(s"Path does not exist: $path")
      else if !Files.isDirectory(target) then Left(s"Path is not a directory: $path")
      else
        val stream = Files.list(target)
        try
          Right(stream.iterator().asScala.toList.sortBy(_.getFileName.toString).map(entry(root, _)))
        finally stream.close()
    }

  override def stat(root: ResolvedStorageRoot, path: String): Either[String, StorageEntry] =
    resolve(root, path).flatMap { target =>
      if Files.exists(target) then Right(entry(root, target))
      else Left(s"Path does not exist: $path")
    }

  override def download(root: ResolvedStorageRoot, path: String): Either[String, FileContent] =
    resolve(root, path).flatMap { target =>
      if !Files.exists(target) then Left(s"Path does not exist: $path")
      else if !Files.isRegularFile(target) then Left(s"Path is not a regular file: $path")
      else
        Try(Files.readAllBytes(target))
          .toEither
          .left.map(_.getMessage)
          .map(bytes => FileContent(target.getFileName.toString, mimeType(target), bytes))
    }

  override def preview(root: ResolvedStorageRoot, path: String, maxBytes: Long): Either[String, TextPreview] =
    resolve(root, path).flatMap { target =>
      if !Files.exists(target) then Left(s"Path does not exist: $path")
      else if !Files.isRegularFile(target) then Left(s"Path is not a regular file: $path")
      else if Files.size(target) > maxBytes then Left(s"File exceeds preview limit of $maxBytes bytes")
      else if !isTextLike(target) then Left("File type is not supported for text preview")
      else
        Try(Files.readString(target, StandardCharsets.UTF_8))
          .toEither
          .left.map(_.getMessage)
          .map(content => TextPreview(path, mimeType(target), content, truncated = false))
    }

  override def upload(root: ResolvedStorageRoot, path: String, bytes: Array[Byte], overwrite: Boolean): Either[String, StorageEntry] =
    ensureWritable(root).flatMap { _ =>
      resolve(root, path).flatMap { target =>
        if Files.exists(target) && !overwrite then Left("Target already exists")
        else
          Try {
            val parent = target.getParent
            if parent != null then Files.createDirectories(parent)
            val options =
              if overwrite then Array(StandardCopyOption.REPLACE_EXISTING)
              else Array.empty[StandardCopyOption]
            Files.write(target, bytes)
          }.toEither.left.map(_.getMessage).flatMap(_ => stat(root, path))
      }
    }

  override def createFolder(root: ResolvedStorageRoot, parentPath: String, name: String): Either[String, StorageEntry] =
    ensureWritable(root).flatMap { _ =>
      validName(name).flatMap { folderName =>
        resolve(root, parentPath).flatMap { parent =>
          val target = parent.resolve(folderName).normalize()
          validateInside(root, target).flatMap { safeTarget =>
            if Files.exists(safeTarget) then Left("Target already exists")
            else
              Try(Files.createDirectories(safeTarget))
                .toEither
                .left.map(_.getMessage)
                .flatMap(_ => stat(root, join(parentPath, folderName)))
          }
        }
      }
    }

  override def rename(root: ResolvedStorageRoot, path: String, newName: String): Either[String, StorageEntry] =
    ensureWritable(root).flatMap { _ =>
      validName(newName).flatMap { name =>
        resolve(root, path).flatMap { source =>
          val parent = source.getParent
          if parent == null then Left("Cannot rename storage root")
          else
            val target = parent.resolve(name).normalize()
            validateInside(root, target).flatMap { safeTarget =>
              if !Files.exists(source) then Left(s"Path does not exist: $path")
              else if Files.exists(safeTarget) then Left("Target already exists")
              else
                Try(Files.move(source, safeTarget))
                  .toEither
                  .left.map(_.getMessage)
                  .map(moved => entry(root, moved))
            }
        }
      }
    }

  override def delete(root: ResolvedStorageRoot, path: String): Either[String, Unit] =
    ensureWritable(root).flatMap { _ =>
      if path.trim.isEmpty then Left("Cannot delete storage root")
      else
        resolve(root, path).flatMap { target =>
          if !Files.exists(target) then Left(s"Path does not exist: $path")
          else Try(Files.delete(target)).toEither.left.map(_.getMessage)
        }
    }

  override def copy(root: ResolvedStorageRoot, sourcePath: String, targetPath: String, overwrite: Boolean): Either[String, StorageEntry] =
    ensureWritable(root).flatMap { _ =>
      for
        source <- resolve(root, sourcePath)
        target <- resolve(root, targetPath)
        _ <- Either.cond(Files.exists(source), (), s"Path does not exist: $sourcePath")
        _ <- Either.cond(Files.isRegularFile(source), (), "Copy currently supports regular files only")
        _ <- ensureTargetWritable(target, overwrite)
        copied <- Try {
          val parent = target.getParent
          if parent != null then Files.createDirectories(parent)
          if overwrite then Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING)
          else Files.copy(source, target)
        }.toEither.left.map(_.getMessage)
      yield entry(root, copied)
    }

  override def move(root: ResolvedStorageRoot, sourcePath: String, targetPath: String, overwrite: Boolean): Either[String, StorageEntry] =
    ensureWritable(root).flatMap { _ =>
      for
        source <- resolve(root, sourcePath)
        target <- resolve(root, targetPath)
        base <- filesystemBase(root)
        _ <- Either.cond(source != base.toAbsolutePath.normalize(), (), "Cannot move storage root")
        _ <- Either.cond(Files.exists(source), (), s"Path does not exist: $sourcePath")
        _ <- ensureTargetWritable(target, overwrite)
        moved <- Try {
          val parent = target.getParent
          if parent != null then Files.createDirectories(parent)
          if overwrite then Files.move(source, target, StandardCopyOption.REPLACE_EXISTING)
          else Files.move(source, target)
        }.toEither.left.map(_.getMessage)
      yield entry(root, moved)
    }

  private def resolve(root: ResolvedStorageRoot, relative: String): Either[String, Path] =
    filesystemBase(root).flatMap { basePath =>
      val base = basePath.toAbsolutePath.normalize()
      val clean = Option(relative).getOrElse("").stripPrefix("/")
      val target = base.resolve(clean).normalize()
      validateInside(root, target)
    }

  private def validateInside(root: ResolvedStorageRoot, target: Path): Either[String, Path] =
    filesystemBase(root).flatMap { basePath =>
      val base = basePath.toAbsolutePath.normalize()
      val normalized = target.toAbsolutePath.normalize()
      if normalized.startsWith(base) then Right(normalized)
      else Left("Path escapes configured storage root")
    }

  private def ensureWritable(root: ResolvedStorageRoot): Either[String, Unit] =
    Either.cond(!root.readOnly, (), "Storage root is read-only")

  private def ensureTargetWritable(target: Path, overwrite: Boolean): Either[String, Unit] =
    if Files.exists(target) && !overwrite then Left("Target already exists")
    else Right(())

  private def validName(name: String): Either[String, String] =
    val trimmed = Option(name).getOrElse("").trim
    if trimmed.isEmpty then Left("Name cannot be empty")
    else if trimmed.contains("/") || trimmed.contains("\\") then Left("Name cannot contain path separators")
    else Right(trimmed)

  private def join(parentPath: String, name: String): String =
    val parent = Option(parentPath).getOrElse("").stripSuffix("/")
    if parent.isEmpty then name else s"$parent/$name"

  private def isTextLike(target: Path): Boolean =
    val mt = mimeType(target).getOrElse("").toLowerCase
    val name = target.getFileName.toString.toLowerCase
    mt.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".json") || name.endsWith(".csv")

  private def mimeType(target: Path): Option[String] =
    Try(Option(Files.probeContentType(target))).toOption.flatten

  private def entry(root: ResolvedStorageRoot, target: Path): StorageEntry =
    val base = filesystemBase(root).toOption.get.toAbsolutePath.normalize()
    val absolute = target.toAbsolutePath.normalize()
    val relative = Try(base.relativize(absolute).toString).getOrElse("")
    val normalized = relative.replace('\\', '/')
    val name = Option(target.getFileName).map(_.toString).getOrElse(root.label)
    val kind =
      if Files.isDirectory(target) then "directory"
      else if Files.isRegularFile(target) then "file"
      else "other"
    val size = if Files.isRegularFile(target) then Try(Files.size(target)).toOption else None
    val detectedMimeType = mimeType(target)
    val owner = Try(Files.getOwner(target).getName).toOption
    val permissions = Try(PosixFilePermissions.toString(Files.getPosixFilePermissions(target))).toOption
    val modifiedTime = Try(Files.getLastModifiedTime(target).toInstant.toString).toOption

    StorageEntry(
      id = s"${root.tunnel}:${root.id}:$normalized",
      name = name,
      path = normalized,
      kind = kind,
      metadata = EmptyMetadata(size, detectedMimeType, owner, permissions, modifiedTime),
      capabilities = capabilities(root),
      providerSpecific = Map("filesystem.path" -> absolute.toString)
    )

  private def filesystemBase(root: ResolvedStorageRoot): Either[String, Path] =
    root.target match
      case FilesystemRootTarget(basePath) => Right(basePath)
      case _ => Left("Storage root is not a filesystem root")
