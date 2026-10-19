package authn

import (
	"crypto/hmac"
	"crypto/sha256"
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/securecookie"
	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

const maxCookieBytes = 3500

// PurposeKey separates session authentication, encryption, OIDC transactions and pagination.
func PurposeKey(cfg *config.CagnardConfig, purpose string) []byte {
	key, err := config.SessionKey(cfg.Auth.Session.Key)
	if err != nil {
		panic("invalid authentication session key: validate configuration before constructing a server")
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte("cagnard/v2/" + purpose))
	return mac.Sum(nil)
}

type SessionService struct {
	cfg   *config.CagnardConfig
	codec *securecookie.SecureCookie
	clock func() time.Time
}

func protectedCodec(cfg *config.CagnardConfig, purpose string, ttl int) *securecookie.SecureCookie {
	return securecookie.New(PurposeKey(cfg, purpose+"/authenticate"), PurposeKey(cfg, purpose+"/encrypt")).SetSerializer(securecookie.JSONEncoder{}).MaxAge(ttl).MaxLength(maxCookieBytes)
}
func NewSessionService(cfg *config.CagnardConfig) *SessionService {
	return NewSessionServiceWithClock(cfg, time.Now)
}
func NewSessionServiceWithClock(cfg *config.CagnardConfig, clock func() time.Time) *SessionService {
	return &SessionService{cfg: cfg, codec: protectedCodec(cfg, "session", int(cfg.Auth.Session.TTLSeconds)), clock: clock}
}
func cookieName(cfg *config.CagnardConfig, purpose string) string {
	if cfg.Auth.Session.SecureCookies {
		return "__Host-Cagnard-" + purpose
	}
	return "Cagnard-" + purpose
}
func (s *SessionService) CookieName() string { return cookieName(s.cfg, "Session-v2") }
func (s *SessionService) Issue(e sessionEvidence) (string, error) {
	return s.codec.Encode(s.CookieName(), e)
}
func (s *SessionService) Verify(token string) (sessionEvidence, *Failure) {
	var e sessionEvidence
	if err := s.codec.Decode(s.CookieName(), token, &e); err != nil {
		return e, invalidSession()
	}
	if !validLifetime(e, s.clock(), s.cfg.Auth.Session.TTLSeconds) {
		return sessionEvidence{}, invalidSession()
	}
	return e, nil
}
func validLifetime(e sessionEvidence, now time.Time, ttl int64) bool {
	return e.Version == 2 && e.ProviderID != "" && e.Subject != "" && e.IssuedAt <= now.Unix() && e.ExpiresAt > now.Unix() && e.ExpiresAt > e.IssuedAt && e.ExpiresAt-e.IssuedAt <= ttl
}
func makeCookie(cfg *config.CagnardConfig, name, value string, maxAge int) string {
	c := http.Cookie{Name: name, Value: value, Path: "/", HttpOnly: true, Secure: cfg.Auth.Session.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: maxAge}
	if maxAge < 0 {
		c.Expires = time.Unix(1, 0)
	}
	return c.String()
}
func (s *SessionService) Cookie(token string) string {
	return makeCookie(s.cfg, s.CookieName(), token, int(s.cfg.Auth.Session.TTLSeconds))
}
func (s *SessionService) ClearCookie() string { return makeCookie(s.cfg, s.CookieName(), "", -1) }
func safeLength(value string, max int) error {
	if len(value) == 0 || len(value) > max {
		return fmt.Errorf("identity field exceeds bounds")
	}
	return nil
}
