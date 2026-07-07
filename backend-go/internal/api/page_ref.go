package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

type entryPageRef struct {
	Version       int     `json:"version"`
	Tunnel        string  `json:"tunnel"`
	RootID        string  `json:"rootId"`
	Path          string  `json:"path"`
	Query         string  `json:"query"`
	SortKey       string  `json:"sortKey"`
	SortDirection string  `json:"sortDirection"`
	PageSize      int     `json:"pageSize"`
	Cursor        *string `json:"cursor"`
}

func (s *Server) encodePageRef(ref entryPageRef) (string, error) {
	payload, err := json.Marshal(ref)
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(payload)
	return body + "." + s.signPageRef(body), nil
}

func (s *Server) decodePageRef(value string) (entryPageRef, error) {
	body, signature, ok := strings.Cut(value, ".")
	if !ok || body == "" || signature == "" {
		return entryPageRef{}, fmt.Errorf("Page reference is malformed")
	}
	expected := s.signPageRef(body)
	if subtle.ConstantTimeCompare([]byte(expected), []byte(signature)) != 1 {
		return entryPageRef{}, fmt.Errorf("Page reference signature is invalid")
	}
	payload, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return entryPageRef{}, fmt.Errorf("Page reference payload is invalid")
	}
	var ref entryPageRef
	if err := json.Unmarshal(payload, &ref); err != nil {
		return entryPageRef{}, fmt.Errorf("Page reference payload is invalid")
	}
	if ref.Version != 1 {
		return entryPageRef{}, fmt.Errorf("Page reference version is unsupported")
	}
	return ref, nil
}

func (s *Server) signPageRef(value string) string {
	mac := hmac.New(sha256.New, []byte(s.pageRefSecret()))
	_, _ = mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Server) pageRefSecret() string {
	if s.cfg.Auth.Session != nil && s.cfg.Auth.Session.SigningSecret != nil {
		return *s.cfg.Auth.Session.SigningSecret
	}
	return ""
}

func (r entryPageRef) validate(root storage.ResolvedStorageRoot, path string, query string, sortKey string, sortDirection string, pageSize int) error {
	if r.Tunnel != root.Tunnel || r.RootID != root.ID {
		return fmt.Errorf("Page reference does not match the active storage root")
	}
	if r.Path != path || r.Query != query || r.SortKey != sortKey || r.SortDirection != sortDirection || r.PageSize != pageSize {
		return fmt.Errorf("Page reference does not match the current listing criteria")
	}
	return nil
}
