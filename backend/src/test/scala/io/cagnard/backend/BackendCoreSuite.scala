package io.cagnard.backend

import cats.effect.IO
import io.cagnard.backend.api.{ApiRoutes, ApiService, DeleteEntryRequest, UserProfile}
import io.cagnard.backend.auth.{AccessService, RequestIdentity}
import io.cagnard.backend.config.*
import io.cagnard.backend.storage.{ResolvedStorageRoot, StorageRegistry}
import com.typesafe.config.ConfigFactory
import munit.CatsEffectSuite
import org.http4s.{Header, Method, Request, Status, Uri}
import org.typelevel.ci.CIString

import java.nio.file.{Files, Path, Paths}

class BackendCoreSuite extends CatsEffectSuite:
  test("loads the example stateless configuration") {
    ConfigLoader.load(exampleConfigPath).map { config =>
      assertEquals(config.server.host, "0.0.0.0")
      assertEquals(config.auth.configuredUsersEnabled, true)
      assertEquals(config.providers.map(_.id), List("local"))
      assertEquals(config.personalStorage.map(_.id), List("home"))
      assertEquals(config.globalStorage.map(_.id), List("shared"))
      assertEquals(config.uiPlugins.map(_.id), List("text-preview"))
      assert(config.personalStorage.head.path.endsWith("examples/storage/home/{user.id}"))
    }
  }

  test("loads HOCON with includes and substitutions") {
    tempDirectory.use { root =>
      val configPath = root.resolve("cagnard.conf")
      val includePath = root.resolve("plugins.conf")
      val property = "cagnard.test.storage.path"

      val writeFiles =
        IO.blocking {
          Files.writeString(
            includePath,
            """
              |uiPlugins = [
              |  {
              |    id = text-preview
              |    label = "Text preview"
              |    kind = preview
              |    apiVersion = "1"
              |    enabled = true
              |    mimeTypes = ["text/plain"]
              |    extensions = [".txt"]
              |    permissions = [read]
              |    priority = 10
              |  }
              |]
              |""".stripMargin
          )
          Files.writeString(
            configPath,
            """
              |# HOCON comments are accepted.
              |include "plugins.conf"
              |
              |server { host = "127.0.0.1", port = 8081 }
              |auth {
              |  configuredUsersEnabled = true
              |  defaultUser = alice
              |  oidcProviders = []
              |}
              |users = [
              |  { id = alice, displayName = "Alice", roles = [user], groups = [engineering], claims = {} }
              |]
              |providers = [
              |  { id = local, type = filesystem, family = unix, displayName = "Local filesystem" }
              |]
              |accounts = [
              |  { id = local-admin, providerId = local, displayName = "Local", enabled = true, readOnly = false, authMode = local-process }
              |]
              |personalStorage = [
              |  { id = home, label = Home, providerId = local, accountId = local-admin, path = ${cagnard.test.storage.path}, allowedUsers = [alice] }
              |]
              |globalStorage = []
              |""".stripMargin
          )
          System.setProperty(property, root.resolve("home/{user.id}").toString)
          ConfigFactory.invalidateCaches()
        }

      val clearProperty =
        IO.blocking {
          System.clearProperty(property)
          ConfigFactory.invalidateCaches()
        }.void

      writeFiles *> ConfigLoader.load(configPath).guarantee(clearProperty).map { config =>
        assertEquals(config.server.port, 8081)
        assertEquals(config.personalStorage.head.path, root.resolve("home/{user.id}").toString)
        assertEquals(config.uiPlugins.map(_.id), List("text-preview"))
      }
    }
  }

  test("reports invalid HOCON syntax with file context") {
    tempDirectory.use { root =>
      val configPath = root.resolve("broken.conf")
      IO.blocking(Files.writeString(configPath, "server { host = \"127.0.0.1\" ")).flatMap { _ =>
        ConfigLoader.load(configPath).attempt.map { result =>
          val error = result.left.toOption.get
          assert(error.getMessage.contains("Invalid config"))
          assert(error.getMessage.contains(configPath.toAbsolutePath.normalize().toString))
        }
      }
    }
  }

  test("reports typed decode failures with file context") {
    tempDirectory.use { root =>
      val configPath = root.resolve("typed-invalid.conf")
      IO.blocking(Files.writeString(configPath, """server { host = "127.0.0.1" }""")).flatMap { _ =>
        ConfigLoader.load(configPath).attempt.map { result =>
          val error = result.left.toOption.get
          assert(error.getMessage.contains("Invalid config"))
          assert(error.getMessage.contains(configPath.toAbsolutePath.normalize().toString))
        }
      }
    }
  }

  test("filters personal and global roots by user rights") {
    val service = AccessService(testConfig(Paths.get("/tmp/cagnard-test")))
    val alice = UserProfile("alice", "Alice", List("user"), List("engineering"), Map.empty)
    val bob = UserProfile("bob", "Bob", List("guest"), List("sales"), Map.empty)

    assertEquals(service.personalRoots(alice).map(_.id), List("home"))
    assertEquals(service.globalRoots(alice).map(_.id), List("shared"))
    assertEquals(service.personalRoots(bob).map(_.id), Nil)
    assertEquals(service.globalRoots(bob).map(_.id), Nil)
  }

  test("registers filesystem provider capabilities") {
    val config = testConfig(Paths.get("/tmp/cagnard-test"))
    val registry = StorageRegistry.fromConfig(config).toOption.get
    val root = ResolvedStorageRoot("home", "Home", "personal", "local", "local-admin", "unix", readOnly = false, Paths.get("/tmp/cagnard-test"))
    val capabilityNames = registry.provider("local").toOption.get.capabilities(root).map(capability => capability.name -> capability.status).toMap

    assertEquals(capabilityNames("list"), "supported")
    assertEquals(capabilityNames("stat"), "supported")
    assertEquals(capabilityNames("preview"), "supported")
    assertEquals(capabilityNames("delete"), "supported")
    assertEquals(capabilityNames("upload"), "supported")
    assertEquals(capabilityNames("create-folder"), "supported")
  }

  test("lists files through the Unix filesystem provider") {
    tempDirectory.use { root =>
      val child = root.resolve("note.txt")
      IO.blocking(Files.writeString(child, "hello")).flatMap { _ =>
        IO.fromEither(StorageRegistry.fromConfig(testConfig(root))).map { registry =>
          val storageRoot = ResolvedStorageRoot("home", "Home", "personal", "local", "local-admin", "unix", readOnly = false, root)
          val provider = registry.provider("local").toOption.get
          val entries = provider.list(storageRoot, "").toOption.get

          assertEquals(entries.map(_.name), List("note.txt"))
          assertEquals(entries.head.kind, "file")
          assertEquals(entries.head.metadata.size, Some(5L))
          assert(entries.head.metadata.modifiedTime.nonEmpty)
        }
      }
    }
  }

  test("serves downloaded file content as raw bytes") {
    tempDirectory.use { root =>
      val bytes = Array.tabulate(4096)(index => (index % 251).toByte)
      IO.blocking(Files.write(root.resolve("payload.bin"), bytes)).flatMap { _ =>
        val config = testConfig(root)
        IO.fromEither(StorageRegistry.fromConfig(config)).flatMap { registry =>
          val app = ApiRoutes(ApiService(config, registry)).routes.orNotFound
          val request = Request[IO](
            method = Method.GET,
            uri = Uri.unsafeFromString("/api/storage/content?tunnel=personal&rootId=home&path=payload.bin")
          ).putHeaders(Header.Raw(CIString("X-Cagnard-User"), "alice"))

          app.run(request).flatMap { response =>
            response.body.compile.to(Array).map { downloaded =>
              assertEquals(response.status, Status.Ok)
              assertEquals(downloaded.toSeq, bytes.toSeq)
            }
          }
        }
      }
    }
  }

  test("performs filesystem mutation success paths") {
    tempDirectory.use { root =>
      IO.fromEither(StorageRegistry.fromConfig(testConfig(root))).map { registry =>
        val storageRoot = ResolvedStorageRoot("home", "Home", "personal", "local", "local-admin", "unix", readOnly = false, root)
        val provider = registry.provider("local").toOption.get

        val uploaded = provider.upload(storageRoot, "docs/note.txt", "hello".getBytes, overwrite = false).toOption.get
        assertEquals(uploaded.path, "docs/note.txt")

        val preview = provider.preview(storageRoot, "docs/note.txt", maxBytes = 1024).toOption.get
        assertEquals(preview.content, "hello")

        val folder = provider.createFolder(storageRoot, "", "archive").toOption.get
        assertEquals(folder.kind, "directory")

        val renamed = provider.rename(storageRoot, "docs/note.txt", "renamed.txt").toOption.get
        assertEquals(renamed.path, "docs/renamed.txt")

        val copied = provider.copy(storageRoot, "docs/renamed.txt", "archive/copied.txt", overwrite = false).toOption.get
        assertEquals(copied.path, "archive/copied.txt")

        val moved = provider.move(storageRoot, "archive/copied.txt", "moved.txt", overwrite = false).toOption.get
        assertEquals(moved.path, "moved.txt")

        assert(provider.delete(storageRoot, "moved.txt").isRight)
        assert(!Files.exists(root.resolve("moved.txt")))
      }
    }
  }

  test("rejects path traversal attempts") {
    tempDirectory.use { root =>
      IO.fromEither(StorageRegistry.fromConfig(testConfig(root))).map { registry =>
        val storageRoot = ResolvedStorageRoot("home", "Home", "personal", "local", "local-admin", "unix", readOnly = false, root)
        val provider = registry.provider("local").toOption.get

        val result = provider.upload(storageRoot, "../escape.txt", "bad".getBytes, overwrite = false)
        assert(result.isLeft)
        assert(!Files.exists(root.getParent.resolve("escape.txt")))
      }
    }
  }

  test("rejects read-only mutations before provider write") {
    tempDirectory.use { root =>
      val config = testConfig(root, readOnly = true)
      IO.fromEither(StorageRegistry.fromConfig(config)).flatMap { registry =>
        val service = ApiService(config, registry)
        service.uploadContent(identity, "personal", "home", "note.txt", overwrite = false, "hello".getBytes).map { result =>
          assertEquals(result.left.toOption.map(_.code), Some("read_only_root"))
          assert(!Files.exists(root.resolve("note.txt")))
        }
      }
    }
  }

  test("requires delete confirmation") {
    tempDirectory.use { root =>
      IO.blocking(Files.writeString(root.resolve("note.txt"), "hello")).flatMap { _ =>
        val config = testConfig(root)
        IO.fromEither(StorageRegistry.fromConfig(config)).flatMap { registry =>
          val service = ApiService(config, registry)
          service.deleteEntry(identity, DeleteEntryRequest("personal", "home", "note.txt", confirmed = false)).map { result =>
            assertEquals(result.left.toOption.map(_.code), Some("confirmation_required"))
            assert(Files.exists(root.resolve("note.txt")))
          }
        }
      }
    }
  }

  test("rejects overwrite conflicts without approval") {
    tempDirectory.use { root =>
      IO.fromEither(StorageRegistry.fromConfig(testConfig(root))).map { registry =>
        val storageRoot = ResolvedStorageRoot("home", "Home", "personal", "local", "local-admin", "unix", readOnly = false, root)
        val provider = registry.provider("local").toOption.get

        assert(provider.upload(storageRoot, "note.txt", "one".getBytes, overwrite = false).isRight)
        val conflict = provider.upload(storageRoot, "note.txt", "two".getBytes, overwrite = false)
        assertEquals(conflict.left.toOption, Some("Target already exists"))
        assertEquals(Files.readString(root.resolve("note.txt")), "one")
      }
    }
  }

  private def tempDirectory =
    cats.effect.Resource.make(IO.blocking(Files.createTempDirectory("cagnard-test"))) { path =>
      IO.blocking(deleteRecursively(path)).void
    }

  private def deleteRecursively(path: Path): Unit =
    if Files.exists(path) then
      if Files.isDirectory(path) then
        val stream = Files.list(path)
        try stream.forEach(deleteRecursively)
        finally stream.close()
      Files.deleteIfExists(path)

  private val identity = RequestIdentity(Some("alice"), None)

  private def testConfig(root: Path, readOnly: Boolean = false): CagnardConfig =
    CagnardConfig(
      server = ServerConfig("127.0.0.1", 8080),
      auth = AuthConfig(configuredUsersEnabled = true, defaultUser = Some("alice"), oidcProviders = Nil),
      users = List(ConfiguredUser("alice", "Alice", List("user"), List("engineering"), Map.empty)),
      providers = List(ProviderConfig("local", "filesystem", "unix", "Local filesystem")),
      accounts = List(StorageAccountConfig("local-admin", "local", "Local", enabled = true, readOnly = readOnly, "local-process")),
      personalStorage = List(StorageRootConfig("home", "Home", "local", "local-admin", root.toString, Some(List("alice")), None, None)),
      globalStorage = List(StorageRootConfig("shared", "Global", "local", "local-admin", root.toString, None, Some(List("user")), None)),
      uiPlugins = List(UiPluginConfig("text-preview", "Text preview", "preview", "1", enabled = true, Some(List("text/plain")), Some(List(".txt")), Some(List("read")), 10))
    )

  private def exampleConfigPath: Path =
    val rootRelative = Paths.get("config/cagnard.example.conf")
    if Files.exists(rootRelative) then rootRelative else Paths.get("..", "config", "cagnard.example.conf")
