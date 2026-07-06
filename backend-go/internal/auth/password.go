package auth

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"strconv"
	"strings"

	"golang.org/x/crypto/pbkdf2"
)

const pbkdf2SHA256 = "pbkdf2-sha256"

func VerifyPassword(password string, verifier string) bool {
	parts := strings.SplitN(verifier, ":", 4)
	if len(parts) != 4 || parts[0] != pbkdf2SHA256 {
		return false
	}

	iterations, err := strconv.Atoi(parts[1])
	if err != nil || iterations <= 0 {
		return false
	}

	salt, err := decodeURLBase64(parts[2])
	if err != nil {
		return false
	}
	expected, err := decodeURLBase64(parts[3])
	if err != nil || len(expected) == 0 {
		return false
	}

	actual := pbkdf2.Key([]byte(password), salt, iterations, len(expected), sha256.New)
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func decodeURLBase64(value string) ([]byte, error) {
	if out, err := base64.RawURLEncoding.DecodeString(value); err == nil {
		return out, nil
	}
	return base64.URLEncoding.DecodeString(value)
}
