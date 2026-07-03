package io.cagnard.backend.auth

import io.cagnard.backend.api.UserProfile
import io.cagnard.backend.config.{CagnardConfig, StorageRootConfig}
import io.cagnard.backend.storage.{FilesystemRootTarget, ObjectStoreRootTarget, ResolvedStorageRoot, StorageRootTarget}

import java.nio.file.Paths

class AccessService(config: CagnardConfig):
  private val accounts = config.accounts.map(account => account.id -> account).toMap
  private val providers = config.providers.map(provider => provider.id -> provider).toMap

  def personalRoots(user: UserProfile): List[ResolvedStorageRoot] =
    config.personalStorage.filter(isAllowed(_, user)).flatMap(resolve("personal", _, user))

  def globalRoots(user: UserProfile): List[ResolvedStorageRoot] =
    config.globalStorage.filter(isAllowed(_, user)).flatMap(resolve("global", _, user))

  private def isAllowed(root: StorageRootConfig, user: UserProfile): Boolean =
    val allowedUsers = root.allowedUsers.getOrElse(Nil)
    val allowedRoles = root.allowedRoles.getOrElse(Nil)
    val allowedGroups = root.allowedGroups.getOrElse(Nil)
    val hasNoRules = allowedUsers.isEmpty && allowedRoles.isEmpty && allowedGroups.isEmpty

    hasNoRules ||
      allowedUsers.contains(user.id) ||
      user.roles.exists(allowedRoles.contains) ||
      user.groups.exists(allowedGroups.contains)

  private def resolve(tunnel: String, root: StorageRootConfig, user: UserProfile): Option[ResolvedStorageRoot] =
    for
      account <- accounts.get(root.accountId).filter(_.enabled)
      provider <- providers.get(root.providerId)
      target <- rootTarget(provider.`type`, root, user)
    yield ResolvedStorageRoot(
      id = root.id,
      label = displayLabel(provider.`type`, root),
      tunnel = tunnel,
      providerId = root.providerId,
      accountId = root.accountId,
      providerFamily = provider.family,
      readOnly = account.readOnly,
      target = target,
      settings = root.settings.getOrElse(Map.empty)
    )

  private def rootTarget(providerType: String, root: StorageRootConfig, user: UserProfile): Option[StorageRootTarget] =
    providerType match
      case "filesystem" =>
        root.path.map(path => FilesystemRootTarget(Paths.get(interpolate(path, user)).normalize()))
      case "s3" =>
        root.settings
          .flatMap(_.get("bucket"))
          .map(bucket => ObjectStoreRootTarget(bucket, normalizePrefix(root.settings.flatMap(_.get("prefix")).getOrElse(""))))
      case _ => None

  private def displayLabel(providerType: String, root: StorageRootConfig): String =
    root.label
      .map(_.trim)
      .filter(_.nonEmpty)
      .orElse(
        Option.when(providerType == "s3") {
          root.settings.flatMap(_.get("bucket")).getOrElse(root.id)
        }
      )
      .getOrElse(root.id)

  private def normalizePrefix(raw: String): String =
    raw
      .split("/")
      .filter(_.nonEmpty)
      .mkString("/")

  private def interpolate(raw: String, user: UserProfile): String =
    val withUser = raw.replace("{user.id}", user.id).replace("{user.name}", user.id)
    user.claims.foldLeft(withUser) { case (path, (key, value)) =>
      path.replace(s"{claim.$key}", value)
    }
