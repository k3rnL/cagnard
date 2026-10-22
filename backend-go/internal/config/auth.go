package config

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"reflect"
	"regexp"
	"strconv"
	"strings"

	"github.com/gurkankaymak/hocon"
	"github.com/k3rnl/cagnard/backend-go/internal/identity"
)

func decodeStrict(raw hocon.Object, out any) error {
	data, err := json.Marshal(plainHOCON(raw))
	if err != nil {
		return fmt.Errorf("invalid configuration object")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(out); err != nil {
		return fmt.Errorf("invalid auth/policy field or type: %w", err)
	}
	return nil
}

func decodeAuthConfiguration(root hocon.Object) (AuthConfig, AuthorizationConfig, error) {
	auth := AuthConfig{Session: SessionConfig{TTLSeconds: 3600, SecureCookies: true}}
	policy := AuthorizationConfig{}
	migration := fmt.Errorf("legacy authentication/access configuration is unsupported; migrate to auth.version = 2 and authorization.bindings (docs/guides/migrating-auth.md)")
	if _, ok := root["users"]; ok {
		return auth, policy, migration
	}
	for _, key := range []string{"mode", "defaultUser", "configuredUsersEnabled", "staticProvider", "oidcProviders"} {
		if _, ok := objectAt(root, "auth")[key]; ok {
			return auth, policy, migration
		}
	}
	for _, area := range []string{"personalStorage", "globalStorage"} {
		for _, value := range arrayAt(root, area) {
			if obj, ok := value.(hocon.Object); ok {
				for _, key := range []string{"allowedUsers", "allowedRoles", "allowedGroups"} {
					if _, exists := obj[key]; exists {
						return auth, policy, migration
					}
				}
			}
		}
	}
	if err := decodeStrict(objectAt(root, "auth"), &auth); err != nil {
		return auth, policy, err
	}
	if err := decodeStrict(objectAt(root, "authorization"), &policy); err != nil {
		return auth, policy, err
	}
	return auth, policy, nil
}

func SessionKey(raw string) ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("auth.session.key must be base64-encoded 32-byte key material")
	}
	return key, nil
}

func IsLoopbackURL(value string) bool {
	u, err := url.Parse(value)
	if err != nil {
		return false
	}
	host := u.Hostname()
	ip := net.ParseIP(host)
	return host == "localhost" || (ip != nil && ip.IsLoopback())
}

var providerIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`)

func authConfigurationErrors(cfg *CagnardConfig) []string {
	var errs []string
	add := func(message string) { errs = append(errs, message) }
	if cfg.Auth.Version != 2 {
		add("auth.version = 2 is required; see docs/guides/migrating-auth.md")
	}
	if _, err := SessionKey(cfg.Auth.Session.Key); err != nil {
		add(err.Error())
	}
	if cfg.Auth.Session.TTLSeconds <= 0 || cfg.Auth.Session.TTLSeconds > 86400 {
		add("auth.session.ttlSeconds must be between 1 and 86400")
	}
	public, err := url.Parse(cfg.Auth.PublicURL)
	if err != nil || public.Host == "" || public.User != nil || public.RawQuery != "" || public.Fragment != "" || (public.Path != "" && public.Path != "/") {
		add("auth.publicUrl must be an absolute application origin without credentials, path, query or fragment")
	} else if public.Scheme != "https" && !(public.Scheme == "http" && cfg.Auth.AllowInsecureLoopback && IsLoopbackURL(cfg.Auth.PublicURL)) {
		add("auth.publicUrl requires HTTPS; HTTP is allowed only with allowInsecureLoopback on a loopback origin")
	}
	if !cfg.Auth.Session.SecureCookies && !(cfg.Auth.AllowInsecureLoopback && IsLoopbackURL(cfg.Auth.PublicURL)) {
		add("Secure cookies are required except for explicit loopback development")
	}
	groups, roles, providers := map[string]bool{}, map[string]bool{}, map[string]AuthProviderConfig{}
	unique := func(seen map[string]bool, kind, id string) {
		if id == "" || seen[id] {
			add(kind + " IDs must be non-empty and unique")
		}
		seen[id] = true
	}
	for _, group := range cfg.Authorization.Groups {
		unique(groups, "group", group.ID)
	}
	for _, role := range cfg.Authorization.Roles {
		unique(roles, "role", role.ID)
		if len(role.Actions) == 0 {
			add("role " + role.ID + " must declare actions")
		}
		for _, action := range role.Actions {
			if !identity.KnownAction(action) {
				add("role " + role.ID + " references an unknown action")
			}
		}
	}
	keys := map[string]bool{}
	checkKey := func(key string) {
		if key == "" {
			return
		}
		if !identity.ValidStorageKey(key) || strings.HasPrefix(key, "p-") || keys[key] {
			add("storage keys must be unique safe segments; p- is reserved for derived keys")
		}
		keys[key] = true
	}
	checkUsers := func(users []ConfiguredUser, password bool) {
		ids := map[string]bool{}
		for _, user := range users {
			unique(ids, "user", user.ID)
			checkKey(user.StorageKey)
			if password && user.Enabled && (user.Credential == nil || !validVerifier(user.Credential.Verifier)) {
				add("enabled static users require a valid PBKDF2-SHA256 credential.verifier")
			}
			for _, group := range user.Groups {
				if !groups[group] {
					add("user references an undeclared group")
				}
			}
		}
	}
	enabled := 0
	providerIDs := map[string]bool{}
	for _, p := range cfg.Auth.Providers {
		unique(providerIDs, "authentication provider", p.ID)
		if p.ID == "development" || !providerIDPattern.MatchString(p.ID) {
			add("authentication provider ID must be 1-64 ASCII letters, digits, underscores or hyphens, start with a letter/digit, and not be development")
		}
		providers[p.ID] = p
		if p.Enabled {
			enabled++
		}
		switch p.Type {
		case "static":
			checkUsers(p.Users, true)
			if p.Issuer != "" || p.ClientID != "" || p.ClientSecret != "" || p.TrustAllCertificates || len(p.GroupMappings) > 0 || len(p.StorageKeys) > 0 {
				add("OIDC fields are not allowed on a static provider")
			}
		case "oidc":
			u, err := url.Parse(p.Issuer)
			if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "https" && !(u.Scheme == "http" && cfg.Auth.AllowInsecureLoopback && IsLoopbackURL(p.Issuer))) {
				add("OIDC issuer must be a trusted HTTPS URL (or explicit loopback HTTP)")
			}
			if p.ClientID == "" || p.ClientSecret == "" {
				add("OIDC provider requires clientId and clientSecret")
			}
			if len(p.Users) != 0 {
				add("OIDC providers cannot contain static users")
			}
			for _, m := range p.GroupMappings {
				if !identity.ValidClaimPath(m.Claim) || m.Value == "" || !groups[m.Group] {
					add("OIDC groupMappings require a valid JSON Pointer, exact value and declared group")
				}
			}
			subjects := map[string]bool{}
			for _, m := range p.StorageKeys {
				unique(subjects, "storage-key subject", m.Subject)
				if m.StorageKey == "" {
					add("storage-key override cannot be empty")
				}
				checkKey(m.StorageKey)
			}
		default:
			add("authentication provider type must be static or oidc")
		}
	}
	dev := cfg.Auth.Development
	if dev != nil && dev.Enabled {
		if len(cfg.Auth.Providers) > 0 {
			add("auth.development is mutually exclusive with login providers")
		}
		if !cfg.Auth.AllowInsecureLoopback || !IsLoopbackURL(cfg.Auth.PublicURL) {
			add("development identities require explicit loopback configuration")
		}
		if ip := net.ParseIP(cfg.Server.Host); cfg.Server.Host != "localhost" && (ip == nil || !ip.IsLoopback()) {
			add("development identities require server.host to bind to loopback")
		}
		checkUsers(dev.Users, false)
		found := dev.DefaultUser == ""
		for _, user := range dev.Users {
			found = found || (user.ID == dev.DefaultUser && user.Enabled)
		}
		if !found {
			add("development.defaultUser must identify an enabled development user")
		}
		providers["development"] = AuthProviderConfig{ID: "development", Type: "development", Users: dev.Users}
	} else if enabled == 0 {
		add("at least one login provider must be enabled")
	}
	storageProviders, accounts := map[string]bool{}, map[string]StorageAccountConfig{}
	for _, provider := range cfg.Providers {
		unique(storageProviders, "storage provider", provider.ID)
	}
	accountIDs := map[string]bool{}
	for _, account := range cfg.Accounts {
		unique(accountIDs, "storage account", account.ID)
		if !storageProviders[account.ProviderID] {
			add("account references unknown storage provider")
		}
		accounts[account.ID] = account
	}
	roots := map[RootRef]bool{}
	for tunnel, entries := range map[string][]StorageRootConfig{"personal": cfg.PersonalStorage, "global": cfg.GlobalStorage} {
		ids := map[string]bool{}
		for _, root := range entries {
			unique(ids, "root within "+tunnel, root.ID)
			roots[RootRef{Tunnel: tunnel, RootID: root.ID}] = true
			if account, ok := accounts[root.AccountID]; !ok || account.ProviderID != root.ProviderID {
				add("root must reference an account belonging to its provider")
			}
			for _, target := range []string{ptrString(root.Path), root.Settings["prefix"]} {
				remainder := strings.ReplaceAll(target, "{principal.storageKey}", "key")
				if strings.ContainsAny(remainder, "{}") {
					add("root supports only the {principal.storageKey} placeholder")
				}
			}
		}
	}
	for _, binding := range cfg.Authorization.Bindings {
		if len(binding.Subjects) == 0 || len(binding.Roles) == 0 || len(binding.Roots) == 0 {
			add("authorization bindings require subjects, roles and roots")
		}
		for _, role := range binding.Roles {
			if !roles[role] {
				add("binding references undeclared role")
			}
		}
		for _, root := range binding.Roots {
			if !roots[root] {
				add("binding references unknown tunnel/root")
			}
		}
		for _, subject := range binding.Subjects {
			selectors := 0
			if subject.Group != "" {
				selectors++
				if !groups[subject.Group] {
					add("binding references undeclared group")
				}
			}
			if subject.Authenticated {
				selectors++
			}
			if subject.ProviderID != "" || subject.Subject != "" {
				selectors++
				p, exists := providers[subject.ProviderID]
				if !exists || subject.Subject == "" {
					add("binding identity requires a known providerId and non-empty subject")
				} else if p.Type != "oidc" {
					found := false
					for _, user := range p.Users {
						found = found || user.ID == subject.Subject
					}
					if !found {
						add("binding references unknown configured user")
					}
				}
			}
			if selectors != 1 {
				add("binding subject must select exactly one group, identity or authenticated audience")
			}
		}
	}
	return errs
}

func ptrString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func validVerifier(value string) bool {
	parts := strings.Split(value, ":")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" {
		return false
	}
	iterations, parseErr := strconv.Atoi(parts[1])
	if err := parseErr; err != nil || iterations < 10000 || iterations > 2000000 {
		return false
	}
	decode := func(raw string) ([]byte, error) {
		return base64.RawURLEncoding.DecodeString(strings.TrimRight(raw, "="))
	}
	salt, e1 := decode(parts[2])
	hash, e2 := decode(parts[3])
	return e1 == nil && e2 == nil && len(salt) >= 16 && len(hash) == 32
}

// HOCON represents unquoted dotted strings as concatenations, not JSON arrays.
func plainHOCON(v hocon.Value) any {
	if v == nil {
		return nil
	}
	switch value := v.(type) {
	case hocon.Object:
		out := map[string]any{}
		for k, item := range value {
			out[k] = plainHOCON(item)
		}
		return out
	case hocon.Array:
		out := []any{}
		for _, item := range value {
			out = append(out, plainHOCON(item))
		}
		return out
	}
	if v.Type() == hocon.ConcatenationType {
		parts := reflect.ValueOf(v)
		var text strings.Builder
		for i := 0; i < parts.Len(); i++ {
			text.WriteString(scalarString(parts.Index(i).Interface().(hocon.Value)))
		}
		return text.String()
	}
	return v
}
