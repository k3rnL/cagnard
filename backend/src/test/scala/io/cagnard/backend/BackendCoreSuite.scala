package io.cagnard.backend

import cats.effect.IO
import io.cagnard.backend.api.{
  ApiError,
  ApiRoutes,
  ApiService,
  AuthProvidersResponse,
  DeleteEntryRequest,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  SessionResponse,
  UserProfile
}
import io.cagnard.backend.api.ApiModels.given
import io.cagnard.backend.auth.{AccessService, RequestIdentity}
import io.cagnard.backend.config.*
import io.cagnard.backend.storage.{ResolvedStorageRoot, StorageRegistry}
import com.typesafe.config.ConfigFactory
import munit.CatsEffectSuite
import org.http4s.{Header, Method, Request, Response, Status, Uri}
import org.http4s.circe.CirceEntityCodec.given
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

  test("discovers static login provider") {
    tempDirectory.use { root =>
      val config = staticConfig(root)
      appFor(config).flatMap { app =>
        app.run(Request[IO](Method.GET, Uri.unsafeFromString("/api/auth/providers"))).flatMap { response =>
          response.as[AuthProvidersResponse].map { body =>
            assertEquals(response.status, Status.Ok)
            assertEquals(body.providers.map(_.id), List("static"))
            assertEquals(body.providers.head.kind, "static")
            assertEquals(body.providers.head.fields.map(_.name), List("username", "password"))
          }
        }
      }
    }
  }

  test("logs in static user and issues stateless session cookie") {
    tempDirectory.use { root =>
      val config = staticConfig(root)
      appFor(config).flatMap { app =>
        val request = loginRequest("alice", "cagnard")

        app.run(request).flatMap { response =>
          val cookie = setCookie(response)
          response.as[LoginResponse].map { body =>
            assertEquals(response.status, Status.Ok)
            assertEquals(body.session.user.id, "alice")
            assertEquals(body.session.authMode, "static")
            assert(cookie.startsWith("CAGNARD_SESSION="))
            assert(cookie.contains("HttpOnly"))
            assert(cookie.contains("SameSite=Lax"))
          }
        }
      }
    }
  }

  test("returns same public failure for unknown static user and invalid password") {
    tempDirectory.use { root =>
      val config = staticConfig(root)
      appFor(config).flatMap { app =>
        def failedLogin(username: String, password: String): IO[(Status, ApiError)] =
          app.run(loginRequest(username, password)).flatMap { response =>
            response.as[ApiError].map(error => response.status -> error)
          }

        for
          unknown <- failedLogin("unknown", "cagnard")
          invalid <- failedLogin("alice", "wrong")
        yield
          assertEquals(unknown._1, Status.Unauthorized)
          assertEquals(invalid._1, Status.Unauthorized)
          assertEquals(unknown._2.code, "authentication_failed")
          assertEquals(invalid._2.code, "authentication_failed")
          assertEquals(unknown._2.message, invalid._2.message)
      }
    }
  }

  test("resolves static session from browser cookie") {
    tempDirectory.use { root =>
      val config = staticConfig(root)
      appFor(config).flatMap { app =>
        app.run(loginRequest("alice", "cagnard")).flatMap { loginResponse =>
          val cookie = cookiePair(setCookie(loginResponse))
          loginResponse.as[LoginResponse].flatMap { _ =>
            app.run(Request[IO](Method.GET, Uri.unsafeFromString("/api/session")).putHeaders(Header.Raw(CIString("Cookie"), cookie))).flatMap { response =>
              response.as[SessionResponse].map { body =>
                assertEquals(response.status, Status.Ok)
                assertEquals(body.user.id, "alice")
                assertEquals(body.authMode, "static")
              }
            }
          }
        }
      }
    }
  }

  test("logout clears static session cookie") {
    tempDirectory.use { root =>
      val config = staticConfig(root)
      appFor(config).flatMap { app =>
        app.run(Request[IO](Method.POST, Uri.unsafeFromString("/api/auth/logout"))).flatMap { response =>
          val cookie = setCookie(response)
          response.as[LogoutResponse].map { body =>
            assertEquals(response.status, Status.Ok)
            assertEquals(body.success, true)
            assert(cookie.startsWith("CAGNARD_SESSION="))
            assert(cookie.contains("Max-Age=0"))
          }
        }
      }
    }
  }

  test("requires static session for protected routes") {
    tempDirectory.use { root =>
      val config = staticConfig(root)
      appFor(config).flatMap { app =>
        app.run(Request[IO](Method.GET, Uri.unsafeFromString("/api/storage/navigation"))).flatMap { response =>
          response.as[ApiError].map { body =>
            assertEquals(response.status, Status.Unauthorized)
            assertEquals(body.code, "unauthorized")
          }
        }
      }
    }
  }

  test("keeps development identity header and default-user compatibility") {
    tempDirectory.use { root =>
      val config = testConfig(root)
      appFor(config).flatMap { app =>
        val headerRequest =
          Request[IO](Method.GET, Uri.unsafeFromString("/api/session")).putHeaders(Header.Raw(CIString("X-Cagnard-User"), "alice"))
        val defaultRequest = Request[IO](Method.GET, Uri.unsafeFromString("/api/session"))

        for
          headerResponse <- app.run(headerRequest)
          headerBody <- headerResponse.as[SessionResponse]
          defaultResponse <- app.run(defaultRequest)
          defaultBody <- defaultResponse.as[SessionResponse]
        yield
          assertEquals(headerResponse.status, Status.Ok)
          assertEquals(headerBody.user.id, "alice")
          assertEquals(headerBody.authMode, "configured-user")
          assertEquals(defaultResponse.status, Status.Ok)
          assertEquals(defaultBody.user.id, "alice")
          assertEquals(defaultBody.authMode, "configured-user")
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

  private val identity = RequestIdentity(Some("alice"), None, Map.empty)

  private def testConfig(root: Path, readOnly: Boolean = false): CagnardConfig =
    CagnardConfig(
      server = ServerConfig("127.0.0.1", 8080),
      auth = AuthConfig(Some("development"), configuredUsersEnabled = true, defaultUser = Some("alice"), None, None, oidcProviders = Nil),
      users = List(ConfiguredUser("alice", "Alice", List("user"), List("engineering"), Map.empty, None)),
      providers = List(ProviderConfig("local", "filesystem", "unix", "Local filesystem")),
      accounts = List(StorageAccountConfig("local-admin", "local", "Local", enabled = true, readOnly = readOnly, "local-process")),
      personalStorage = List(StorageRootConfig("home", "Home", "local", "local-admin", root.toString, Some(List("alice")), None, None)),
      globalStorage = List(StorageRootConfig("shared", "Global", "local", "local-admin", root.toString, None, Some(List("user")), None)),
      uiPlugins = List(UiPluginConfig("text-preview", "Text preview", "preview", "1", enabled = true, Some(List("text/plain")), Some(List(".txt")), Some(List("read")), 10))
    )

  private def staticConfig(root: Path): CagnardConfig =
    testConfig(root).copy(
      auth = AuthConfig(
        Some("static"),
        configuredUsersEnabled = true,
        defaultUser = None,
        session = Some(SessionConfig(Some("test-static-session-signing-secret"), Some(28800L), Some("CAGNARD_SESSION"), Some(false))),
        staticProvider = Some(StaticProviderConfig(Some("static"), Some("Cagnard account"), Some(true))),
        oidcProviders = Nil
      ),
      users = List(
        ConfiguredUser(
          "alice",
          "Alice",
          List("user"),
          List("engineering"),
          Map.empty,
          Some(StaticUserCredentialConfig(demoVerifier))
        )
      )
    )

  private def appFor(config: CagnardConfig) =
    IO.fromEither(StorageRegistry.fromConfig(config)).map { registry =>
      ApiRoutes(ApiService(config, registry)).routes.orNotFound
    }

  private def loginRequest(username: String, password: String): Request[IO] =
    Request[IO](Method.POST, Uri.unsafeFromString("/api/auth/login"))
      .withEntity(LoginRequest("static", Some(username), Some(password)))

  private def setCookie(response: Response[IO]): String =
    response.headers.get(CIString("Set-Cookie")).map(_.head.value).getOrElse("")

  private def cookiePair(setCookie: String): String =
    setCookie.split(";", 2).head

  private val demoVerifier =
    "pbkdf2-sha256:120000:Y2FnbmFyZC1kZW1vLXN0YXRpYy11c2VyLXNhbHQ:fUdgpOu_Z3MHhgdWzUku12tWnSH5s9BhfjJVv1fiIms"

  private def exampleConfigPath: Path =
    val rootRelative = Paths.get("config/cagnard.example.conf")
    if Files.exists(rootRelative) then rootRelative else Paths.get("..", "config", "cagnard.example.conf")
