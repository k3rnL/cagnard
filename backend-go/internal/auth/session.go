package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

const defaultCookieName = "CAGNARD_SESSION"
const defaultTTLSeconds = 8 * 60 * 60

type SessionService struct {
	cookieName    string
	ttlSeconds    int64
	secureCookies bool
	signingSecret string
	clock         func() time.Time
}

func NewSessionService(cfg *config.CagnardConfig) *SessionService {
	return NewSessionServiceWithClock(cfg, time.Now)
}

func NewSessionServiceWithClock(cfg *config.CagnardConfig, clock func() time.Time) *SessionService {
	session := cfg.Auth.Session
	cookieName := defaultCookieName
	ttlSeconds := int64(defaultTTLSeconds)
	secureCookies := false
	signingSecret := ""
	if session != nil {
		if session.CookieName != nil && strings.TrimSpace(*session.CookieName) != "" {
			cookieName = *session.CookieName
		}
		if session.TTLSeconds != nil {
			ttlSeconds = *session.TTLSeconds
		}
		if session.SecureCookies != nil {
			secureCookies = *session.SecureCookies
		}
		if session.SigningSecret != nil {
			signingSecret = *session.SigningSecret
		}
	}
	return &SessionService{
		cookieName:    cookieName,
		ttlSeconds:    ttlSeconds,
		secureCookies: secureCookies,
		signingSecret: signingSecret,
		clock:         clock,
	}
}

func (s *SessionService) CookieName() string {
	return s.cookieName
}

func (s *SessionService) Issue(principal AuthenticatedPrincipal) (string, error) {
	now := s.clock().Unix()
	claims := SessionClaims{
		ProviderID: principal.ProviderID,
		Subject:    principal.Subject,
		IssuedAt:   now,
		ExpiresAt:  now + s.ttlSeconds,
	}
	return s.encode(claims)
}

func (s *SessionService) Verify(token string) (SessionClaims, *Failure) {
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 {
		return SessionClaims{}, &Failure{Code: "invalid_session", Message: "Session token is malformed"}
	}

	signed := parts[0] + "." + parts[1]
	expected := s.sign(signed)
	if subtle.ConstantTimeCompare([]byte(expected), []byte(parts[2])) != 1 {
		return SessionClaims{}, &Failure{Code: "invalid_session", Message: "Session signature is invalid"}
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return SessionClaims{}, &Failure{Code: "invalid_session", Message: "Session payload is invalid"}
	}
	var claims SessionClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return SessionClaims{}, &Failure{Code: "invalid_session", Message: "Session payload is invalid"}
	}
	if claims.ExpiresAt <= s.clock().Unix() {
		return SessionClaims{}, &Failure{Code: "session_expired", Message: "Session has expired"}
	}
	return claims, nil
}

func (s *SessionService) Cookie(token string) string {
	return fmt.Sprintf("%s=%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=%d%s", s.cookieName, token, s.ttlSeconds, s.secureSuffix())
}

func (s *SessionService) ClearCookie() string {
	return fmt.Sprintf("%s=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0%s", s.cookieName, s.secureSuffix())
}

func (s *SessionService) encode(claims SessionClaims) (string, error) {
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"CagnardSession"}`))
	body := base64.RawURLEncoding.EncodeToString(payload)
	unsigned := header + "." + body
	return unsigned + "." + s.sign(unsigned), nil
}

func (s *SessionService) sign(value string) string {
	mac := hmac.New(sha256.New, []byte(s.signingSecret))
	_, _ = mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *SessionService) secureSuffix() string {
	if s.secureCookies {
		return "; Secure"
	}
	return ""
}
