package io.cagnard.backend.config

case class CagnardConfig(
    server: ServerConfig,
    auth: AuthConfig,
    users: List[ConfiguredUser],
    providers: List[ProviderConfig],
    accounts: List[StorageAccountConfig],
    personalStorage: List[StorageRootConfig],
    globalStorage: List[StorageRootConfig],
    uiPlugins: List[UiPluginConfig]
)

case class ServerConfig(host: String, port: Int)

case class AuthConfig(
    configuredUsersEnabled: Boolean,
    defaultUser: Option[String],
    oidcProviders: List[OidcProviderConfig]
)

case class OidcProviderConfig(
    id: String,
    issuer: String,
    audience: String,
    groupsClaim: String
)

case class ConfiguredUser(
    id: String,
    displayName: String,
    roles: List[String],
    groups: List[String],
    claims: Map[String, String]
)

case class ProviderConfig(
    id: String,
    `type`: String,
    family: String,
    displayName: String
)

case class StorageAccountConfig(
    id: String,
    providerId: String,
    displayName: String,
    enabled: Boolean,
    readOnly: Boolean,
    authMode: String
)

case class StorageRootConfig(
    id: String,
    label: String,
    providerId: String,
    accountId: String,
    path: String,
    allowedUsers: Option[List[String]],
    allowedRoles: Option[List[String]],
    allowedGroups: Option[List[String]]
)

case class UiPluginConfig(
    id: String,
    label: String,
    kind: String,
    apiVersion: String,
    enabled: Boolean,
    mimeTypes: Option[List[String]],
    extensions: Option[List[String]],
    permissions: Option[List[String]],
    priority: Int
)
