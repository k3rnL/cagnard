// Package identity defines login-provider-independent identities and actions.
package identity

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"regexp"
	"strings"
)

const (
	List   = "storage.list"
	Read   = "storage.read"
	Write  = "storage.write"
	Mkdir  = "storage.mkdir"
	Rename = "storage.rename"
	Delete = "storage.delete"
)

var Actions = []string{List, Read, Write, Mkdir, Rename, Delete}

// Profile is the safe browser-visible portion of a principal. ID is opaque;
// Subject is the provider's user identifier, never an authorization shortcut.
type Profile struct {
	ID          string   `json:"id"`
	ProviderID  string   `json:"providerId"`
	Subject     string   `json:"subject"`
	DisplayName string   `json:"displayName"`
	Groups      []string `json:"groups"`
}

type Principal struct {
	Profile    Profile
	Issuer     string
	StorageKey string
	AuthMode   string
	ExpiresAt  int64
}

func ID(provider, issuer, subject string) string {
	payload, _ := json.Marshal([]string{"v2", provider, issuer, subject})
	sum := sha256.Sum256(payload)
	return "p_" + base64.RawURLEncoding.EncodeToString(sum[:])
}

func DefaultStorageKey(id string) string {
	sum := sha256.Sum256([]byte(id))
	return "p-" + hex.EncodeToString(sum[:])
}

var storageKeyPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

func ValidStorageKey(key string) bool {
	return storageKeyPattern.MatchString(key) && key != "." && key != ".."
}

func KnownAction(action string) bool {
	for _, known := range Actions {
		if action == known {
			return true
		}
	}
	return false
}

func Mutating(action string) bool { return action != List && action != Read }

func ValidClaimPath(path string) bool {
	if !strings.HasPrefix(path, "/") {
		return false
	}
	for i := 0; i < len(path); i++ {
		if path[i] == '~' {
			i++
			if i >= len(path) || (path[i] != '0' && path[i] != '1') {
				return false
			}
		}
	}
	return true
}
