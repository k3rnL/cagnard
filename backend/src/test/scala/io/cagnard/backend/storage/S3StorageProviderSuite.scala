package io.cagnard.backend.storage

import io.cagnard.backend.api.UserProfile
import io.cagnard.backend.auth.AccessService
import io.cagnard.backend.config.*
import munit.FunSuite

import java.time.Instant

class S3StorageProviderSuite extends FunSuite:
  test("registers S3 provider and resolves bucket labels and prefix targets") {
    val config = s3Config(rootLabel = None, prefix = "")
    val registry = StorageRegistry.fromConfig(config).toOption.get
    val roots = AccessService(config).personalRoots(alice)

    assertEquals(registry.provider("s3-main").toOption.get.descriptor.family, "s3")
    assertEquals(roots.map(_.label), List("cagnard-test"))
    assertEquals(roots.head.target, ObjectStoreRootTarget("cagnard-test", ""))
  }

  test("uses custom root display label for prefixed bucket roots") {
    val config = s3Config(rootLabel = Some("Documents"), prefix = "team/docs")
    val root = AccessService(config).personalRoots(alice).head

    assertEquals(root.label, "Documents")
    assertEquals(root.target, ObjectStoreRootTarget("cagnard-test", "team/docs"))
  }

  test("rejects unsafe S3 paths before adapter calls") {
    val fake = FakeS3ObjectClient(Map.empty)
    val provider = testProvider(fake, maxBufferedObjectBytes = 64)
    val result = provider.upload(s3Root(), "../escape.txt", "bad".getBytes, overwrite = false)

    assert(result.isLeft)
    assertEquals(fake.keys, Set.empty[String])
  }

  test("lists S3 prefixes and objects without duplicate folder markers") {
    val fake = FakeS3ObjectClient(
      Map(
        "team/docs/readme.txt" -> fakeObject("team/docs/readme.txt", "hello".getBytes, Some("text/plain")),
        "team/docs/folder/" -> fakeObject("team/docs/folder/", Array.emptyByteArray, Some("application/x-directory")),
        "team/docs/folder/note.txt" -> fakeObject("team/docs/folder/note.txt", "note".getBytes, Some("text/plain"))
      )
    )
    val provider = testProvider(fake)
    val entries = provider.list(s3Root(prefix = "team/docs"), "").toOption.get

    assertEquals(entries.map(entry => entry.name -> entry.kind), List("folder" -> "directory", "readme.txt" -> "file"))
    assertEquals(entries.find(_.name == "readme.txt").flatMap(_.metadata.size), Some(5L))
    assertEquals(entries.find(_.name == "folder").toList.flatMap(_.capabilities.find(_.name == "delete").map(_.status)), List("supported"))
  }

  test("stats implicit S3 prefixes without folder marker objects") {
    val fake = FakeS3ObjectClient(
      Map(
        "team/docs/folder/nested/note.txt" -> fakeObject("team/docs/folder/nested/note.txt", "note".getBytes, Some("text/plain"))
      )
    )
    val provider = testProvider(fake)
    val root = s3Root(prefix = "team/docs")

    val folder = provider.stat(root, "folder").toOption.get
    val nested = provider.stat(root, "folder/nested").toOption.get

    assertEquals(folder.kind, "directory")
    assertEquals(folder.path, "folder")
    assertEquals(nested.kind, "directory")
    assertEquals(nested.path, "folder/nested")
  }

  test("maps S3 object metadata into normalized and provider-specific fields") {
    val metadata = fakeMetadata(
      "team/docs/report.txt",
      size = 10,
      contentType = Some("text/plain"),
      versionId = Some("v1"),
      encryption = Some("AES256"),
      retention = Some("GOVERNANCE")
    )
    val fake = FakeS3ObjectClient(Map("team/docs/report.txt" -> FakeObject("0123456789".getBytes, metadata)))
    val provider = testProvider(fake)
    val entry = provider.stat(s3Root(prefix = "team/docs"), "report.txt").toOption.get

    assertEquals(entry.metadata.size, Some(10L))
    assertEquals(entry.metadata.mimeType, Some("text/plain"))
    assertEquals(entry.metadata.fileCategory, Some("text"))
    assertEquals(entry.metadata.fileIcon, Some("file-text"))
    assertEquals(entry.metadata.version, Some("v1"))
    assertEquals(entry.metadata.encryption, Some("AES256"))
    assertEquals(entry.metadata.retention, Some("GOVERNANCE"))
    assert(entry.metadata.unavailable.contains("owner"))
    assertEquals(entry.providerSpecific("s3.bucket"), "cagnard-test")
    assertEquals(entry.providerSpecific("s3.key"), "team/docs/report.txt")
  }

  test("enforces configurable buffered object limit") {
    val fake = FakeS3ObjectClient(Map.empty)
    val provider = testProvider(fake, maxBufferedObjectBytes = 4)
    val result = provider.upload(s3Root(), "too-large.txt", "12345".getBytes, overwrite = false)

    assertEquals(result.left.toOption, Some("Object exceeds buffered object limit of 4 bytes"))
  }

  test("copies, moves, renames, and deletes S3 objects through adapter operations") {
    val fake = FakeS3ObjectClient(Map("team/docs/source.txt" -> fakeObject("team/docs/source.txt", "hello".getBytes, Some("text/plain"))))
    val provider = testProvider(fake)
    val root = s3Root(prefix = "team/docs")

    assert(provider.copy(root, "source.txt", "copy.txt", overwrite = false).isRight)
    assert(fake.keys.contains("team/docs/source.txt"))
    assert(fake.keys.contains("team/docs/copy.txt"))

    assert(provider.move(root, "copy.txt", "moved.txt", overwrite = false).isRight)
    assert(!fake.keys.contains("team/docs/copy.txt"))
    assert(fake.keys.contains("team/docs/moved.txt"))

    assert(provider.rename(root, "moved.txt", "renamed.txt").isRight)
    assert(!fake.keys.contains("team/docs/moved.txt"))
    assert(fake.keys.contains("team/docs/renamed.txt"))

    assert(provider.delete(root, "renamed.txt").isRight)
    assert(!fake.keys.contains("team/docs/renamed.txt"))
  }

  test("deletes S3 directory-like prefixes recursively") {
    val fake = FakeS3ObjectClient(
      Map(
        "team/docs/folder/readme.txt" -> fakeObject("team/docs/folder/readme.txt", "hello".getBytes, Some("text/plain")),
        "team/docs/folder/nested/deep.txt" -> fakeObject("team/docs/folder/nested/deep.txt", "deep".getBytes, Some("text/plain")),
        "team/docs/folder/nested/" -> fakeObject("team/docs/folder/nested/", Array.emptyByteArray, Some("application/x-directory")),
        "team/docs/keep.txt" -> fakeObject("team/docs/keep.txt", "keep".getBytes, Some("text/plain"))
      )
    )
    val provider = testProvider(fake)
    val root = s3Root(prefix = "team/docs")

    assert(provider.delete(root, "folder").isRight)
    assertEquals(fake.keys.filter(_.startsWith("team/docs/folder/")), Set.empty[String])
    assert(fake.keys.contains("team/docs/keep.txt"))
  }

  test("reports degraded object-store move and rename capabilities") {
    val capabilities = testProvider(FakeS3ObjectClient(Map.empty)).capabilities(s3Root()).map(capability => capability.name -> capability.status).toMap

    assertEquals(capabilities("rename"), "degraded")
    assertEquals(capabilities("move"), "degraded")
    assertEquals(capabilities("open"), "supported")
    assertEquals(capabilities("bounded-read"), "supported")
    assertEquals(capabilities("stream-read"), "planned")
  }

  test("runs opt-in S3-compatible integration smoke test") {
    if sys.env.get("CAGNARD_S3_INTEGRATION").contains("true") then
      val provider = S3StorageProvider.fromConfig(integrationProviderConfig, List(integrationAccountConfig)).toOption.get
      val prefix = sys.env.getOrElse("CAGNARD_S3_PREFIX", s"cagnard-it-${System.currentTimeMillis()}")
      val root = ResolvedStorageRoot(
        "s3-it",
        "S3 integration",
        "personal",
        "s3-it",
        "s3-it-account",
        "s3",
        readOnly = false,
        ObjectStoreRootTarget(requiredEnv("CAGNARD_S3_BUCKET"), prefix),
        Map.empty
      )
      val path = "smoke.txt"

      assert(provider.upload(root, path, "hello from cagnard".getBytes, overwrite = true).isRight)
      assert(provider.list(root, "").toOption.get.exists(_.name == path))
      assertEquals(new String(provider.download(root, path).toOption.get.bytes), "hello from cagnard")
      assert(provider.delete(root, path).isRight)
    else
      assert(true)
  }

  private val alice =
    UserProfile("alice", "Alice", List("user"), Nil, Map.empty)

  private def s3Config(rootLabel: Option[String], prefix: String): CagnardConfig =
    CagnardConfig(
      server = ServerConfig("127.0.0.1", 8080),
      auth = AuthConfig(Some("development"), configuredUsersEnabled = true, defaultUser = Some("alice"), None, None, Nil),
      users = List(ConfiguredUser("alice", "Alice", List("user"), Nil, Map.empty, None)),
      providers = List(
        ProviderConfig(
          "s3-main",
          "s3",
          "s3",
          "S3 compatible",
          Some(Map("region" -> "us-east-1", "endpoint" -> "http://127.0.0.1:9000", "pathStyleAccess" -> "true"))
        )
      ),
      accounts = List(
        StorageAccountConfig(
          "s3-account",
          "s3-main",
          "S3 account",
          enabled = true,
          readOnly = false,
          "static",
          Some(Map("accessKeyId" -> "test-access", "secretAccessKey" -> "test-secret"))
        )
      ),
      personalStorage = List(
        StorageRootConfig(
          "s3-home",
          rootLabel,
          "s3-main",
          "s3-account",
          None,
          Some(Map("bucket" -> "cagnard-test", "prefix" -> prefix)),
          Some(List("alice")),
          None,
          None
        )
      ),
      globalStorage = Nil,
      uiPlugins = Nil
    )

  private def testProvider(fake: S3ObjectClient, maxBufferedObjectBytes: Long = 64 * 1024 * 1024): S3StorageProvider =
    S3StorageProvider(
      ProviderConfig("s3-main", "s3", "s3", "S3 compatible", None),
      S3ProviderSettings(
        endpoint = None,
        region = "us-east-1",
        pathStyleAccess = true,
        sslEnabled = true,
        trustAllCertificates = false,
        maxBufferedObjectBytes = maxBufferedObjectBytes,
        maxListPages = 100
      ),
      Map("s3-account" -> fake)
    )

  private def s3Root(prefix: String = ""): ResolvedStorageRoot =
    ResolvedStorageRoot(
      "s3-home",
      "Documents",
      "personal",
      "s3-main",
      "s3-account",
      "s3",
      readOnly = false,
      ObjectStoreRootTarget("cagnard-test", prefix),
      Map.empty
    )

  private def integrationProviderConfig: ProviderConfig =
    ProviderConfig(
      "s3-it",
      "s3",
      "s3",
      "S3 integration",
      Some(
        Map(
          "region" -> sys.env.getOrElse("CAGNARD_S3_REGION", "us-east-1"),
          "endpoint" -> requiredEnv("CAGNARD_S3_ENDPOINT"),
          "pathStyleAccess" -> sys.env.getOrElse("CAGNARD_S3_PATH_STYLE", "true"),
          "sslEnabled" -> sys.env.getOrElse("CAGNARD_S3_SSL_ENABLED", "false"),
          "trustAllCertificates" -> sys.env.getOrElse("CAGNARD_S3_TRUST_ALL_CERTIFICATES", "false")
        )
      )
    )

  private def integrationAccountConfig: StorageAccountConfig =
    StorageAccountConfig(
      "s3-it-account",
      "s3-it",
      "S3 integration account",
      enabled = true,
      readOnly = false,
      "static",
      Some(
        Map(
          "accessKeyId" -> requiredEnv("CAGNARD_S3_ACCESS_KEY"),
          "secretAccessKey" -> requiredEnv("CAGNARD_S3_SECRET_KEY")
        ) ++ sys.env.get("CAGNARD_S3_SESSION_TOKEN").map("sessionToken" -> _).toMap
      )
    )

  private def requiredEnv(name: String): String =
    sys.env.getOrElse(name, throw IllegalArgumentException(s"$name is required when CAGNARD_S3_INTEGRATION=true"))

  private def fakeObject(key: String, bytes: Array[Byte], contentType: Option[String]): FakeObject =
    FakeObject(bytes, fakeMetadata(key, bytes.length.toLong, contentType))

  private def fakeMetadata(
      key: String,
      size: Long,
      contentType: Option[String],
      versionId: Option[String] = None,
      encryption: Option[String] = None,
      retention: Option[String] = None
  ): S3ObjectMetadata =
    S3ObjectMetadata(
      key = key,
      size = Some(size),
      contentType = contentType,
      lastModified = Some(Instant.parse("2026-07-03T00:00:00Z")),
      eTag = Some("etag"),
      versionId = versionId,
      storageClass = Some("STANDARD"),
      encryption = encryption,
      retention = retention,
      checksum = Some("checksum"),
      providerSpecific = Map("s3.etag" -> "etag", "s3.storageClass" -> "STANDARD", "s3.checksum" -> "checksum")
    )

case class FakeObject(bytes: Array[Byte], metadata: S3ObjectMetadata)

class FakeS3ObjectClient(initial: Map[String, FakeObject]) extends S3ObjectClient:
  private var objects = initial

  def keys: Set[String] = objects.keySet

  override def list(bucket: String, prefix: String, delimiter: String, continuationToken: Option[String]): Either[String, S3ListPage] =
    val matching = objects.keys.toList.filter(_.startsWith(prefix)).sorted
    val commonPrefixes = matching.flatMap { key =>
      val rest = key.stripPrefix(prefix)
      rest.indexOf(delimiter) match
        case index if index >= 0 => Some(prefix + rest.take(index + 1))
        case _ => None
    }.distinct
    val files = matching
      .filterNot(key => commonPrefixes.exists(prefix => key.startsWith(prefix)))
      .flatMap(key => objects.get(key).map(obj => S3ListedObject(key, obj.metadata.size, obj.metadata.eTag, obj.metadata.lastModified, obj.metadata.storageClass)))
    Right(S3ListPage(files, commonPrefixes, None))

  override def head(bucket: String, key: String): Either[String, S3ObjectMetadata] =
    objects.get(key).map(_.metadata).toRight("Path does not exist")

  override def exists(bucket: String, key: String): Either[String, Boolean] =
    Right(objects.contains(key))

  override def get(bucket: String, key: String): Either[String, S3ObjectContent] =
    objects.get(key).map(obj => S3ObjectContent(obj.metadata, obj.bytes)).toRight("Path does not exist")

  override def put(bucket: String, key: String, bytes: Array[Byte], contentType: Option[String]): Either[String, S3ObjectMetadata] =
    val metadata = S3ObjectMetadata(
      key = key,
      size = Some(bytes.length.toLong),
      contentType = contentType,
      lastModified = Some(Instant.parse("2026-07-03T00:00:00Z")),
      eTag = Some("etag"),
      versionId = None,
      storageClass = Some("STANDARD"),
      encryption = None,
      retention = None,
      checksum = None,
      providerSpecific = Map("s3.etag" -> "etag", "s3.storageClass" -> "STANDARD")
    )
    objects = objects + (key -> FakeObject(bytes, metadata))
    Right(metadata)

  override def copy(bucket: String, sourceKey: String, targetKey: String): Either[String, S3ObjectMetadata] =
    objects.get(sourceKey).toRight("Path does not exist").flatMap { source =>
      val metadata = source.metadata.copy(key = targetKey)
      objects = objects + (targetKey -> source.copy(metadata = metadata))
      Right(metadata)
    }

  override def delete(bucket: String, key: String): Either[String, Unit] =
    objects = objects - key
    Right(())
