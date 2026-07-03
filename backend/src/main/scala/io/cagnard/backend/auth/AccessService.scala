package io.cagnard.backend.auth

import io.cagnard.backend.api.UserProfile
import io.cagnard.backend.config.{CagnardConfig, StorageRootConfig}
import io.cagnard.backend.storage.ResolvedStorageRoot

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
    yield ResolvedStorageRoot(
      id = root.id,
      label = root.label,
      tunnel = tunnel,
      providerId = root.providerId,
      accountId = root.accountId,
      providerFamily = provider.family,
      readOnly = account.readOnly,
      basePath = Paths.get(interpolate(root.path, user)).normalize()
    )

  private def interpolate(raw: String, user: UserProfile): String =
    val withUser = raw.replace("{user.id}", user.id).replace("{user.name}", user.id)
    user.claims.foldLeft(withUser) { case (path, (key, value)) =>
      path.replace(s"{claim.$key}", value)
    }
