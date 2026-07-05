package io.cagnard.backend.storage

import io.cagnard.backend.api.{EntryMetadata, StorageEntry}
import io.cagnard.backend.config.{ProviderConfig, StorageAccountConfig}
import software.amazon.awssdk.auth.credentials.*
import software.amazon.awssdk.core.ResponseBytes
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.http.TlsTrustManagersProvider
import software.amazon.awssdk.http.apache.ApacheHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.{S3Client, S3Configuration}
import software.amazon.awssdk.services.s3.model.*

import java.net.URI
import java.security.cert.X509Certificate
import java.time.Instant
import javax.net.ssl.{TrustManager, X509TrustManager}
import scala.annotation.tailrec
import scala.jdk.CollectionConverters.*
import scala.util.Try

class S3StorageProvider private[storage] (
    config: ProviderConfig,
    providerSettings: S3ProviderSettings,
    clients: Map[String, S3ObjectClient]
) extends StorageProvider:
  override val descriptor: ProviderDescriptor =
    ProviderDescriptor(config.id, config.family, config.displayName, config.`type`)

  override def capabilities(root: ResolvedStorageRoot): List[io.cagnard.backend.api.CapabilityStatus] =
    StorageCapabilities.s3(root.readOnly)

  override def list(root: ResolvedStorageRoot, path: String): Either[String, List[StorageEntry]] =
    for
      target <- objectTarget(root)
      client <- client(root)
      currentPath <- normalizePath(path)
      prefix = keyFor(target, currentPath, directory = true)
      page <- listAll(client, target.bucket, prefix, token = None, pagesSeen = 0)
      entries = entriesFromListing(root, target, page)
    yield entries.sortBy(entry => (entry.kind != "directory", entry.name.toLowerCase))

  override def stat(root: ResolvedStorageRoot, path: String): Either[String, StorageEntry] =
    for
      target <- objectTarget(root)
      client <- client(root)
      relative <- normalizePath(path)
      _ <- Either.cond(relative.nonEmpty, (), "Cannot stat S3 storage root")
      key = keyFor(target, relative)
      exists <- client.exists(target.bucket, key)
      entry <-
        if exists then client.head(target.bucket, key).map(metadata => fileEntry(root, target, metadata))
        else
          val markerKey = keyFor(target, relative, directory = true)
          client.exists(target.bucket, markerKey).flatMap {
            case true => Right(directoryEntry(root, target, markerKey))
            case false => Left(s"Path does not exist: $path")
          }
    yield entry

  override def download(root: ResolvedStorageRoot, path: String): Either[String, FileContent] =
    for
      target <- objectTarget(root)
      client <- client(root)
      relative <- normalizePath(path)
      _ <- Either.cond(relative.nonEmpty, (), "Cannot download S3 storage root")
      key = keyFor(target, relative)
      metadata <- client.head(target.bucket, key)
      _ <- enforceLimit(root, metadata.size.getOrElse(0L))
      content <- client.get(target.bucket, key)
    yield FileContent(fileName(relative), content.metadata.contentType, content.bytes)

  override def preview(root: ResolvedStorageRoot, path: String, maxBytes: Long): Either[String, TextPreview] =
    for
      target <- objectTarget(root)
      client <- client(root)
      relative <- normalizePath(path)
      _ <- Either.cond(relative.nonEmpty, (), "Cannot preview S3 storage root")
      key = keyFor(target, relative)
      metadata <- client.head(target.bucket, key)
      size = metadata.size.getOrElse(0L)
      _ <- Either.cond(size <= maxBytes, (), s"File exceeds preview limit of $maxBytes bytes")
      _ <- Either.cond(size <= maxBufferedBytes(root), (), s"Object exceeds buffered object limit of ${maxBufferedBytes(root)} bytes")
      _ <- Either.cond(isTextLike(relative, metadata.contentType), (), "File type is not supported for text preview")
      content <- client.get(target.bucket, key)
      text <- Try(String(content.bytes, java.nio.charset.StandardCharsets.UTF_8)).toEither.left.map(_.getMessage)
    yield TextPreview(relative, content.metadata.contentType, text, truncated = false)

  override def upload(root: ResolvedStorageRoot, path: String, bytes: Array[Byte], overwrite: Boolean): Either[String, StorageEntry] =
    ensureWritable(root).flatMap { _ =>
      for
        target <- objectTarget(root)
        client <- client(root)
        relative <- normalizePath(path)
        _ <- Either.cond(relative.nonEmpty, (), "Upload path cannot be empty")
        _ <- enforceLimit(root, bytes.length.toLong)
        key = keyFor(target, relative)
        exists <- client.exists(target.bucket, key)
        _ <- Either.cond(overwrite || !exists, (), "Target already exists")
        metadata <- client.put(target.bucket, key, bytes, contentType(relative))
      yield fileEntry(root, target, metadata)
    }

  override def createFolder(root: ResolvedStorageRoot, parentPath: String, name: String): Either[String, StorageEntry] =
    ensureWritable(root).flatMap { _ =>
      for
        target <- objectTarget(root)
        client <- client(root)
        folderName <- validName(name)
        parent <- normalizePath(parentPath)
        relative = joinPath(parent, folderName)
        markerKey = keyFor(target, relative, directory = true)
        exists <- client.exists(target.bucket, markerKey)
        _ <- Either.cond(!exists, (), "Target already exists")
        _ <- client.put(target.bucket, markerKey, Array.emptyByteArray, Some("application/x-directory"))
      yield directoryEntry(root, target, markerKey)
    }

  override def rename(root: ResolvedStorageRoot, path: String, newName: String): Either[String, StorageEntry] =
    ensureWritable(root).flatMap { _ =>
      for
        name <- validName(newName)
        relative <- normalizePath(path)
        _ <- Either.cond(relative.nonEmpty, (), "Cannot rename S3 storage root")
        _ <- Either.cond(!relative.endsWith("/"), (), "Recursive prefix rename is not supported")
        targetPath = joinPath(parentPath(relative), name)
        entry <- copyThenMaybeDelete(root, relative, targetPath, overwrite = false, deleteSource = true)
      yield entry
    }

  override def delete(root: ResolvedStorageRoot, path: String): Either[String, Unit] =
    ensureWritable(root).flatMap { _ =>
      for
        target <- objectTarget(root)
        client <- client(root)
        relative <- normalizePath(path)
        _ <- Either.cond(relative.nonEmpty, (), "Cannot delete S3 storage root")
        key = keyFor(target, relative)
        exists <- client.exists(target.bucket, key)
        result <-
          if exists then client.delete(target.bucket, key)
          else deletePrefix(target, client, relative, path)
      yield result
    }

  override def copy(root: ResolvedStorageRoot, sourcePath: String, targetPath: String, overwrite: Boolean): Either[String, StorageEntry] =
    ensureWritable(root).flatMap(_ => copyThenMaybeDelete(root, sourcePath, targetPath, overwrite, deleteSource = false))

  override def move(root: ResolvedStorageRoot, sourcePath: String, targetPath: String, overwrite: Boolean): Either[String, StorageEntry] =
    ensureWritable(root).flatMap(_ => copyThenMaybeDelete(root, sourcePath, targetPath, overwrite, deleteSource = true))

  private def copyThenMaybeDelete(root: ResolvedStorageRoot, sourcePath: String, targetPath: String, overwrite: Boolean, deleteSource: Boolean): Either[String, StorageEntry] =
    for
      target <- objectTarget(root)
      client <- client(root)
      source <- normalizePath(sourcePath)
      destination <- normalizePath(targetPath)
      _ <- Either.cond(source.nonEmpty && destination.nonEmpty, (), "Source and target paths are required")
      sourceKey = keyFor(target, source)
      targetKey = keyFor(target, destination)
      sourceExists <- client.exists(target.bucket, sourceKey)
      _ <- Either.cond(sourceExists, (), s"Path does not exist: $sourcePath")
      targetExists <- client.exists(target.bucket, targetKey)
      _ <- Either.cond(overwrite || !targetExists, (), "Target already exists")
      metadata <- client.copy(target.bucket, sourceKey, targetKey)
      _ <- if deleteSource then client.delete(target.bucket, sourceKey) else Right(())
    yield fileEntry(root, target, metadata)

  private def deletePrefix(target: ObjectStoreRootTarget, client: S3ObjectClient, relative: String, displayPath: String): Either[String, Unit] =
    val markerKey = keyFor(target, relative, directory = true)
    for
      markerExists <- client.exists(target.bucket, markerKey)
      page <- listAll(client, target.bucket, markerKey, token = None, pagesSeen = 0)
      _ <- Either.cond(markerExists || page.objects.nonEmpty || page.commonPrefixes.nonEmpty, (), s"Path does not exist: $displayPath")
      _ <- deleteChildPrefixes(target, client, page.commonPrefixes)
      _ <- deleteListedObjects(target, client, page.objects)
      _ <- if markerExists && !page.objects.exists(_.key == markerKey) then client.delete(target.bucket, markerKey) else Right(())
    yield ()

  private def deleteChildPrefixes(target: ObjectStoreRootTarget, client: S3ObjectClient, prefixes: List[String]): Either[String, Unit] =
    prefixes.foldLeft[Either[String, Unit]](Right(())) { (acc, prefix) =>
      acc.flatMap { _ =>
        val childRelative = relativeKey(target, prefix).stripSuffix("/")
        deletePrefix(target, client, childRelative, childRelative)
      }
    }

  private def deleteListedObjects(target: ObjectStoreRootTarget, client: S3ObjectClient, objects: List[S3ListedObject]): Either[String, Unit] =
    objects.foldLeft[Either[String, Unit]](Right(())) { (acc, obj) =>
      acc.flatMap(_ => client.delete(target.bucket, obj.key))
    }

  private def listAll(client: S3ObjectClient, bucket: String, prefix: String, token: Option[String], pagesSeen: Int): Either[String, S3ListPage] =
    if pagesSeen >= providerSettings.maxListPages then Left(s"S3 listing exceeded configured page limit of ${providerSettings.maxListPages}")
    else
      client.list(bucket, prefix, delimiter = "/", continuationToken = token).flatMap { page =>
        page.nextContinuationToken match
          case Some(next) =>
            listAll(client, bucket, prefix, Some(next), pagesSeen + 1).map { tail =>
              S3ListPage(page.objects ++ tail.objects, page.commonPrefixes ++ tail.commonPrefixes, None)
            }
          case None => Right(page)
      }

  private def entriesFromListing(root: ResolvedStorageRoot, target: ObjectStoreRootTarget, page: S3ListPage): List[StorageEntry] =
    val directories = page.commonPrefixes.map(prefix => directoryEntry(root, target, prefix))
    val directoryPaths = directories.map(_.path).toSet
    val files = page.objects
      .filterNot(objectSummary => isFolderMarker(objectSummary.key))
      .filterNot(objectSummary => directoryPaths.contains(relativeKey(target, objectSummary.key).stripSuffix("/")))
      .map(summary => fileEntry(root, target, summary.toMetadata))
    directories ++ files

  private def directoryEntry(root: ResolvedStorageRoot, target: ObjectStoreRootTarget, key: String): StorageEntry =
    val relative = relativeKey(target, key).stripSuffix("/")
    StorageEntry(
      id = s"${root.tunnel}:${root.id}:$relative",
      name = fileName(relative),
      path = relative,
      kind = "directory",
      metadata = EntryMetadata(None, None, None, None, None, None, None, None, List("size", "mimeType", "owner", "permissions", "modifiedTime", "version", "retention", "encryption")),
      capabilities = StorageCapabilities.s3(root.readOnly, directory = true),
      providerSpecific = Map("s3.bucket" -> target.bucket, "s3.key" -> key, "s3.prefix" -> target.prefix).filter(_._2.nonEmpty)
    )

  private def fileEntry(root: ResolvedStorageRoot, target: ObjectStoreRootTarget, metadata: S3ObjectMetadata): StorageEntry =
    val relative = relativeKey(target, metadata.key)
    val classification = FileTypeCatalog.classify(relative, metadata.contentType)
    StorageEntry(
      id = s"${root.tunnel}:${root.id}:$relative",
      name = fileName(relative),
      path = relative,
      kind = "file",
      metadata = EntryMetadata(
        size = metadata.size,
        mimeType = classification.mimeType.orElse(metadata.contentType),
        owner = None,
        permissions = None,
        modifiedTime = metadata.lastModified.map(_.toString),
        version = metadata.versionId,
        retention = metadata.retention,
        encryption = metadata.encryption,
        unavailable = unavailableMetadata(metadata),
        fileCategory = Some(classification.category),
        fileIcon = Some(classification.icon),
        mimeTypeSource = Some(classification.source)
      ),
      capabilities = StorageCapabilities.s3(root.readOnly),
      providerSpecific = (Map(
        "s3.bucket" -> target.bucket,
        "s3.key" -> metadata.key,
        "s3.prefix" -> target.prefix
      ) ++ metadata.providerSpecific).filter(_._2.nonEmpty)
    )

  private def objectTarget(root: ResolvedStorageRoot): Either[String, ObjectStoreRootTarget] =
    root.target match
      case target: ObjectStoreRootTarget => Right(target)
      case _ => Left("Storage root is not an S3 object-store root")

  private def client(root: ResolvedStorageRoot): Either[String, S3ObjectClient] =
    clients.get(root.accountId).toRight("S3 account client is not configured")

  private def ensureWritable(root: ResolvedStorageRoot): Either[String, Unit] =
    Either.cond(!root.readOnly, (), "Storage root is read-only")

  private def enforceLimit(root: ResolvedStorageRoot, size: Long): Either[String, Unit] =
    val limit = maxBufferedBytes(root)
    Either.cond(size <= limit, (), s"Object exceeds buffered object limit of $limit bytes")

  private def maxBufferedBytes(root: ResolvedStorageRoot): Long =
    root.settings
      .get("maxBufferedObjectBytes")
      .flatMap(_.toLongOption)
      .getOrElse(providerSettings.maxBufferedObjectBytes)

  private def normalizePath(path: String): Either[String, String] =
    val parts = Option(path).getOrElse("").stripPrefix("/").split("/").toList.filter(_.nonEmpty)
    if parts.exists(part => part == "." || part == "..") then Left("Path escapes configured storage root")
    else Right(parts.mkString("/"))

  private def keyFor(target: ObjectStoreRootTarget, relativePath: String, directory: Boolean = false): String =
    val prefix = target.prefix.stripSuffix("/")
    val relative = relativePath.stripPrefix("/").stripSuffix("/")
    val joined =
      (prefix, relative) match
        case ("", "") => ""
        case ("", value) => value
        case (value, "") => value
        case (left, right) => s"$left/$right"
    if directory && joined.nonEmpty then s"${joined.stripSuffix("/")}/" else joined

  private def relativeKey(target: ObjectStoreRootTarget, key: String): String =
    val prefix = target.prefix.stripSuffix("/")
    if prefix.isEmpty then key.stripPrefix("/")
    else key.stripPrefix(s"$prefix/").stripPrefix("/")

  private def validName(name: String): Either[String, String] =
    val trimmed = Option(name).getOrElse("").trim
    if trimmed.isEmpty then Left("Name cannot be empty")
    else if trimmed.contains("/") || trimmed.contains("\\") then Left("Name cannot contain path separators")
    else Right(trimmed)

  private def parentPath(path: String): String =
    path.split("/").filter(_.nonEmpty).dropRight(1).mkString("/")

  private def joinPath(parent: String, name: String): String =
    if parent.trim.isEmpty then name else s"${parent.stripSuffix("/")}/$name"

  private def fileName(path: String): String =
    path.split("/").filter(_.nonEmpty).lastOption.getOrElse(path)

  private def isFolderMarker(key: String): Boolean =
    key.endsWith("/")

  private def isTextLike(path: String, mimeType: Option[String]): Boolean =
    FileTypeCatalog.isTextLike(path, mimeType)

  private def contentType(path: String): Option[String] =
    FileTypeCatalog.fallbackMimeType(path, None)

  private def unavailableMetadata(metadata: S3ObjectMetadata): List[String] =
    List(
      Some("owner"),
      Some("permissions"),
      Option.when(metadata.versionId.isEmpty)("version"),
      Option.when(metadata.retention.isEmpty)("retention"),
      Option.when(metadata.encryption.isEmpty)("encryption")
    ).flatten

object S3StorageProvider:
  def fromConfig(config: ProviderConfig, accounts: List[StorageAccountConfig]): Either[Throwable, S3StorageProvider] =
    for
      settings <- S3ProviderSettings.from(config).left.map(IllegalArgumentException(_))
      accountClients <- accounts.foldLeft[Either[Throwable, Map[String, S3ObjectClient]]](Right(Map.empty)) { (acc, account) =>
        for
          existing <- acc
          accountSettings <- S3AccountSettings.from(account).left.map(IllegalArgumentException(_))
          client <- AwsS3ObjectClient.create(settings, accountSettings).left.map(IllegalArgumentException(_))
        yield existing + (account.id -> client)
      }
    yield S3StorageProvider(config, settings, accountClients)

case class S3ProviderSettings(
    endpoint: Option[String],
    region: String,
    pathStyleAccess: Boolean,
    sslEnabled: Boolean,
    trustAllCertificates: Boolean,
    maxBufferedObjectBytes: Long,
    maxListPages: Int
)

object S3ProviderSettings:
  private val DefaultMaxBufferedObjectBytes = 64L * 1024L * 1024L

  def from(config: ProviderConfig): Either[String, S3ProviderSettings] =
    val settings = config.settings.getOrElse(Map.empty)
    settings.get("region").map(_.trim).filter(_.nonEmpty).toRight(s"providers.${config.id}.settings.region is required").map { region =>
      S3ProviderSettings(
        endpoint = settings.get("endpoint").map(_.trim).filter(_.nonEmpty).map(endpoint => endpointWithScheme(endpoint, bool(settings, "sslEnabled", default = true))),
        region = region,
        pathStyleAccess = bool(settings, "pathStyleAccess", default = false) || bool(settings, "pathStyle", default = false),
        sslEnabled = bool(settings, "sslEnabled", default = true),
        trustAllCertificates = bool(settings, "trustAllCertificates", default = false) || bool(settings, "insecureTrustAllCertificates", default = false),
        maxBufferedObjectBytes = long(settings, "maxBufferedObjectBytes", DefaultMaxBufferedObjectBytes),
        maxListPages = long(settings, "maxListPages", 1000L).toInt.max(1)
      )
    }

  private def endpointWithScheme(endpoint: String, sslEnabled: Boolean): String =
    if endpoint.startsWith("http://") || endpoint.startsWith("https://") then endpoint
    else if sslEnabled then s"https://$endpoint"
    else s"http://$endpoint"

  private def bool(settings: Map[String, String], key: String, default: Boolean): Boolean =
    settings.get(key).flatMap(_.trim.toBooleanOption).getOrElse(default)

  private def long(settings: Map[String, String], key: String, default: Long): Long =
    settings.get(key).flatMap(_.trim.toLongOption).filter(_ > 0).getOrElse(default)

case class S3AccountSettings(
    credentialMode: String,
    accessKeyId: Option[String],
    secretAccessKey: Option[String],
    sessionToken: Option[String],
    profile: Option[String]
)

object S3AccountSettings:
  def from(account: StorageAccountConfig): Either[String, S3AccountSettings] =
    val settings = account.settings.getOrElse(Map.empty)
    val mode = settings.get("credentialMode").orElse(Some(account.authMode)).map(_.trim).filter(_.nonEmpty).getOrElse("static")
    val accessKeyId = first(settings, "accessKeyId", "accessKey", "access_key")
    val secretAccessKey = first(settings, "secretAccessKey", "secretKey", "secret_key")
    val sessionToken = first(settings, "sessionToken", "session_token")
    val profile = first(settings, "profile", "profileName")
    mode match
      case "static" if accessKeyId.isEmpty => Left(s"accounts.${account.id}.settings.accessKeyId is required for static S3 credentials")
      case "static" if secretAccessKey.isEmpty => Left(s"accounts.${account.id}.settings.secretAccessKey is required for static S3 credentials")
      case "profile" if profile.isEmpty => Left(s"accounts.${account.id}.settings.profile is required for S3 profile credentials")
      case "static" | "default-chain" | "profile" => Right(S3AccountSettings(mode, accessKeyId, secretAccessKey, sessionToken, profile))
      case other => Left(s"accounts.${account.id}.settings.credentialMode '$other' is not supported for S3 accounts")

  private def first(settings: Map[String, String], keys: String*): Option[String] =
    keys.toList.flatMap(key => settings.get(key).map(_.trim).filter(_.nonEmpty)).headOption

trait S3ObjectClient:
  def list(bucket: String, prefix: String, delimiter: String, continuationToken: Option[String]): Either[String, S3ListPage]
  def head(bucket: String, key: String): Either[String, S3ObjectMetadata]
  def exists(bucket: String, key: String): Either[String, Boolean]
  def get(bucket: String, key: String): Either[String, S3ObjectContent]
  def put(bucket: String, key: String, bytes: Array[Byte], contentType: Option[String]): Either[String, S3ObjectMetadata]
  def copy(bucket: String, sourceKey: String, targetKey: String): Either[String, S3ObjectMetadata]
  def delete(bucket: String, key: String): Either[String, Unit]

case class S3ListPage(objects: List[S3ListedObject], commonPrefixes: List[String], nextContinuationToken: Option[String])

case class S3ListedObject(
    key: String,
    size: Option[Long],
    eTag: Option[String],
    lastModified: Option[Instant],
    storageClass: Option[String]
):
  def toMetadata: S3ObjectMetadata =
    S3ObjectMetadata(
      key = key,
      size = size,
      contentType = None,
      lastModified = lastModified,
      eTag = eTag,
      versionId = None,
      storageClass = storageClass,
      encryption = None,
      retention = None,
      checksum = None,
      providerSpecific = providerMetadata
    )

  private def providerMetadata: Map[String, String] =
    Map(
      "s3.etag" -> eTag.getOrElse(""),
      "s3.storageClass" -> storageClass.getOrElse("")
    ).filter(_._2.nonEmpty)

case class S3ObjectMetadata(
    key: String,
    size: Option[Long],
    contentType: Option[String],
    lastModified: Option[Instant],
    eTag: Option[String],
    versionId: Option[String],
    storageClass: Option[String],
    encryption: Option[String],
    retention: Option[String],
    checksum: Option[String],
    providerSpecific: Map[String, String]
)

case class S3ObjectContent(metadata: S3ObjectMetadata, bytes: Array[Byte])

object AwsS3ObjectClient:
  def create(provider: S3ProviderSettings, account: S3AccountSettings): Either[String, S3ObjectClient] =
    Try {
      val s3Builder = S3Client
        .builder()
        .region(Region.of(provider.region))
        .credentialsProvider(credentialsProvider(account))
        .serviceConfiguration(
          S3Configuration
            .builder()
            .pathStyleAccessEnabled(provider.pathStyleAccess)
            .build()
        )

      provider.endpoint.foreach(endpoint => s3Builder.endpointOverride(URI.create(endpoint)))

      val httpClient = ApacheHttpClient.builder()
      if provider.trustAllCertificates then httpClient.tlsTrustManagersProvider(TrustAllTlsManagersProvider)
      s3Builder.httpClientBuilder(httpClient)

      AwsS3ObjectClient(s3Builder.build())
    }.toEither.left.map(error => safeMessage(error))

  private def credentialsProvider(account: S3AccountSettings): AwsCredentialsProvider =
    account.credentialMode match
      case "static" =>
        (account.accessKeyId, account.secretAccessKey, account.sessionToken) match
          case (Some(accessKey), Some(secretKey), Some(token)) =>
            StaticCredentialsProvider.create(AwsSessionCredentials.create(accessKey, secretKey, token))
          case (Some(accessKey), Some(secretKey), None) =>
            StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey))
          case _ => throw IllegalArgumentException("Invalid static S3 credential configuration")
      case "profile" =>
        ProfileCredentialsProvider.builder().profileName(account.profile.get).build()
      case "default-chain" =>
        DefaultCredentialsProvider.create()
      case other =>
        throw IllegalArgumentException(s"Unsupported S3 credential mode '$other'")

  private object TrustAllTlsManagersProvider extends TlsTrustManagersProvider:
    override def trustManagers(): Array[TrustManager] =
      Array(
        new X509TrustManager:
          override def checkClientTrusted(chain: Array[X509Certificate], authType: String): Unit = ()
          override def checkServerTrusted(chain: Array[X509Certificate], authType: String): Unit = ()
          override def getAcceptedIssuers: Array[X509Certificate] = Array.empty
      )

class AwsS3ObjectClient(client: S3Client) extends S3ObjectClient:
  override def list(bucket: String, prefix: String, delimiter: String, continuationToken: Option[String]): Either[String, S3ListPage] =
    attempt {
      val builder = ListObjectsV2Request.builder().bucket(bucket).prefix(prefix).delimiter(delimiter)
      continuationToken.foreach(builder.continuationToken)
      val response = client.listObjectsV2(builder.build())
      S3ListPage(
        objects = response.contents().asScala.toList.map(fromListedObject),
        commonPrefixes = response.commonPrefixes().asScala.toList.map(_.prefix()),
        nextContinuationToken = Option(response.nextContinuationToken()).filter(_.nonEmpty)
      )
    }

  override def head(bucket: String, key: String): Either[String, S3ObjectMetadata] =
    attempt {
      val response = client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build())
      fromHead(key, response)
    }

  override def exists(bucket: String, key: String): Either[String, Boolean] =
    Try {
      client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build())
      true
    }.toEither.left.flatMap {
      case error: S3Exception if error.statusCode() == 404 => Right(false)
      case error => Left(safeMessage(error))
    }

  override def get(bucket: String, key: String): Either[String, S3ObjectContent] =
    attempt {
      val bytes: ResponseBytes[GetObjectResponse] =
        client.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key).build())
      S3ObjectContent(fromGet(key, bytes.response()), bytes.asByteArray())
    }

  override def put(bucket: String, key: String, bytes: Array[Byte], contentType: Option[String]): Either[String, S3ObjectMetadata] =
    for
      _ <- attempt {
        val builder = PutObjectRequest.builder().bucket(bucket).key(key)
        contentType.foreach(builder.contentType)
        client.putObject(builder.build(), RequestBody.fromBytes(bytes))
      }
      metadata <- head(bucket, key)
    yield metadata

  override def copy(bucket: String, sourceKey: String, targetKey: String): Either[String, S3ObjectMetadata] =
    for
      _ <- attempt {
        client.copyObject(
          CopyObjectRequest
            .builder()
            .sourceBucket(bucket)
            .sourceKey(sourceKey)
            .destinationBucket(bucket)
            .destinationKey(targetKey)
            .build()
        )
      }
      metadata <- head(bucket, targetKey)
    yield metadata

  override def delete(bucket: String, key: String): Either[String, Unit] =
    attempt {
      client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build())
      ()
    }

  private def fromListedObject(value: software.amazon.awssdk.services.s3.model.S3Object): S3ListedObject =
    S3ListedObject(
      key = value.key(),
      size = Option(value.size()).map(_.toLong),
      eTag = Option(value.eTag()),
      lastModified = Option(value.lastModified()),
      storageClass = Option(value.storageClassAsString())
    )

  private def fromHead(key: String, response: HeadObjectResponse): S3ObjectMetadata =
    S3ObjectMetadata(
      key = key,
      size = Option(response.contentLength()).map(_.toLong),
      contentType = Option(response.contentType()),
      lastModified = Option(response.lastModified()),
      eTag = Option(response.eTag()),
      versionId = Option(response.versionId()),
      storageClass = Option(response.storageClassAsString()),
      encryption = Option(response.serverSideEncryptionAsString()),
      retention = retention(response.objectLockModeAsString(), Option(response.objectLockRetainUntilDate())),
      checksum = first(response.checksumSHA256(), response.checksumSHA1(), response.checksumCRC32(), response.checksumCRC32C()),
      providerSpecific = providerSpecific(
        eTag = Option(response.eTag()),
        storageClass = Option(response.storageClassAsString()),
        checksum = first(response.checksumSHA256(), response.checksumSHA1(), response.checksumCRC32(), response.checksumCRC32C()),
        objectLockMode = Option(response.objectLockModeAsString()),
        versionId = Option(response.versionId())
      )
    )

  private def fromGet(key: String, response: GetObjectResponse): S3ObjectMetadata =
    S3ObjectMetadata(
      key = key,
      size = Option(response.contentLength()).map(_.toLong),
      contentType = Option(response.contentType()),
      lastModified = Option(response.lastModified()),
      eTag = Option(response.eTag()),
      versionId = Option(response.versionId()),
      storageClass = Option(response.storageClassAsString()),
      encryption = Option(response.serverSideEncryptionAsString()),
      retention = retention(response.objectLockModeAsString(), Option(response.objectLockRetainUntilDate())),
      checksum = first(response.checksumSHA256(), response.checksumSHA1(), response.checksumCRC32(), response.checksumCRC32C()),
      providerSpecific = providerSpecific(
        eTag = Option(response.eTag()),
        storageClass = Option(response.storageClassAsString()),
        checksum = first(response.checksumSHA256(), response.checksumSHA1(), response.checksumCRC32(), response.checksumCRC32C()),
        objectLockMode = Option(response.objectLockModeAsString()),
        versionId = Option(response.versionId())
      )
    )

  private def retention(mode: String, retainUntil: Option[Instant]): Option[String] =
    Option(mode).filter(_.nonEmpty).orElse(retainUntil.map(_.toString))

  private def providerSpecific(
      eTag: Option[String],
      storageClass: Option[String],
      checksum: Option[String],
      objectLockMode: Option[String],
      versionId: Option[String]
  ): Map[String, String] =
    Map(
      "s3.etag" -> eTag.getOrElse(""),
      "s3.storageClass" -> storageClass.getOrElse(""),
      "s3.checksum" -> checksum.getOrElse(""),
      "s3.objectLockMode" -> objectLockMode.getOrElse(""),
      "s3.versionId" -> versionId.getOrElse("")
    ).filter(_._2.nonEmpty)

  private def first(values: String*): Option[String] =
    values.toList.flatMap(value => Option(value).filter(_.nonEmpty)).headOption

private def attempt[A](value: => A): Either[String, A] =
  Try(value).toEither.left.map(error => safeMessage(error))

private def safeMessage(error: Throwable): String =
  val detail = Option(error.getMessage).map(_.take(500)).getOrElse("S3 operation failed")
  s"${error.getClass.getSimpleName}: $detail"
