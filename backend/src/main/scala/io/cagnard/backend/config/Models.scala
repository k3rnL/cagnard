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
    mode: Option[String],
    configuredUsersEnabled: Boolean,
    defaultUser: Option[String],
    session: Option[SessionConfig],
    staticProvider: Option[StaticProviderConfig],
    oidcProviders: List[OidcProviderConfig]
)

case class SessionConfig(
    signingSecret: Option[String],
    ttlSeconds: Option[Long],
    cookieName: Option[String],
    secureCookies: Option[Boolean]
)

case class StaticProviderConfig(
    id: Option[String],
    label: Option[String],
    enabled: Option[Boolean]
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
    claims: Map[String, String],
    credential: Option[StaticUserCredentialConfig]
)

case class StaticUserCredentialConfig(
    verifier: String
)

case class ProviderConfig(
    id: String,
    `type`: String,
    family: String,
    displayName: String,
    settings: Option[Map[String, String]]
)

case class StorageAccountConfig(
    id: String,
    providerId: String,
    displayName: String,
    enabled: Boolean,
    readOnly: Boolean,
    authMode: String,
    settings: Option[Map[String, String]]
)

case class StorageRootConfig(
    id: String,
    label: Option[String],
    providerId: String,
    accountId: String,
    path: Option[String],
    settings: Option[Map[String, String]],
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
