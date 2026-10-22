package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strings"

	auth "github.com/k3rnl/cagnard/backend-go/internal/authn"
	"github.com/k3rnl/cagnard/backend-go/internal/storage"
	"github.com/k3rnl/cagnard/backend-go/internal/storageaccess"
)

// Every route is protected unless explicitly registered here as a public auth/bootstrap route.
func publicRoute(method, path string) bool {
	switch method + " " + path {
	case "GET /api/health", "GET /api/appearance", "GET /api/auth/providers", "POST /api/auth/login", "POST /api/auth/logout":
		return true
	}
	parts := strings.Split(strings.Trim(path, "/"), "/")
	return len(parts) == 5 && parts[0] == "api" && parts[1] == "auth" && parts[2] == "providers" && ((method == "POST" && parts[4] == "start") || (method == "GET" && parts[4] == "callback"))
}
func (s *Server) serveAuthenticated(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	if r.Method != "GET" && r.Method != "HEAD" && !s.resolver.ValidMutation(r) {
		slog.Warn("authentication", "outcome", "mutation_rejected", "reason", "invalid_origin_or_application_header")
		writeAPIError(w, http.StatusForbidden, APIError{Code: "invalid_origin", Message: "A same-origin application request is required"})
		return
	}
	if !publicRoute(r.Method, r.URL.Path) {
		evidence, failure := s.resolver.Authenticate(r)
		if failure != nil {
			writeAuthFailure(w, failure)
			return
		}
		ctx, cancel := evidence.DeadlineContext(r.Context())
		defer cancel()
		r = r.WithContext(auth.WithIdentity(ctx, evidence))
	}
	s.mux.ServeHTTP(w, r)
}
func (s *Server) oidcStart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ReturnTo string `json:"returnTo"`
	}
	if r.Body != nil && r.ContentLength != 0 {
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req) != nil {
			writeAPIError(w, 400, APIError{Code: "invalid_request", Message: "Invalid login request"})
			return
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10_000_000_000)
	defer cancel()
	target, cookie, err := s.resolver.StartOIDC(ctx, r.PathValue("providerId"), req.ReturnTo)
	if err != nil {
		slog.Warn("authentication", "provider", r.PathValue("providerId"), "outcome", "start_failed", "failure", err)
		writeAPIError(w, 503, APIError{Code: "provider_unavailable", Message: "SSO is temporarily unavailable; please try again"})
		return
	}
	w.Header().Add("Set-Cookie", cookie)
	writeJSON(w, 200, map[string]string{"authorizationUrl": target})
}
func (s *Server) oidcCallback(w http.ResponseWriter, r *http.Request) {
	w.Header().Add("Set-Cookie", s.resolver.ClearTransactionCookie())
	token, target, err := s.resolver.CompleteOIDC(r, r.PathValue("providerId"))
	if err != nil {
		slog.Warn("authentication", "provider", r.PathValue("providerId"), "outcome", "callback_failed", "failure", err)
		http.Redirect(w, r, "/?authError=sso_failed", http.StatusSeeOther)
		return
	}
	w.Header().Add("Set-Cookie", s.resolver.SessionCookie(token))
	slog.Info("authentication", "provider", r.PathValue("providerId"), "outcome", "success")
	http.Redirect(w, r, target, http.StatusSeeOther)
}
func (s *Server) rootForIdentity(evidence auth.RequestIdentity, tunnel, rootID string, actions ...string) (storage.ResolvedStorageRoot, *transferAPIError) {
	actor, f := s.resolver.Resolve(evidence)
	if f != nil {
		return storage.ResolvedStorageRoot{}, authAPIError(f)
	}
	root, ok := s.access.Root(actor, tunnel, rootID)
	if !ok {
		return storage.ResolvedStorageRoot{}, notFoundAPIError("Storage root was not found")
	}
	for _, action := range actions {
		if !slices.Contains(root.Actions, action) {
			slog.Info("authorization", "principal", actor.Profile.ID, "tunnel", tunnel, "root", rootID, "action", action, "outcome", "denied")
			return storage.ResolvedStorageRoot{}, &transferAPIError{Status: http.StatusForbidden, Error: APIError{Code: "forbidden", Message: "This action is not permitted"}}
		}
	}
	return root, nil
}
func (s *Server) guardedProvider(evidence auth.RequestIdentity, root storage.ResolvedStorageRoot, required ...string) (storage.StorageProvider, error) {
	provider, err := s.registry.Provider(root.ProviderID)
	if err != nil {
		return nil, err
	}
	return &storageaccess.GuardedProvider{StorageProvider: provider, Deadline: evidence.DeadlineContext, Check: func(actions ...string) error {
		needed := append(append([]string{}, required...), actions...)
		_, apiErr := s.rootForIdentity(evidence, root.Tunnel, root.ID, needed...)
		if apiErr != nil {
			return fmt.Errorf("%s: %s", apiErr.Error.Code, apiErr.Error.Message)
		}
		for _, action := range actions {
			if action != "storage.read" && action != "storage.list" {
				actor, _ := s.resolver.Resolve(evidence)
				slog.Info("storage_mutation", "principal", actor.Profile.ID, "tunnel", root.Tunnel, "root", root.ID, "action", action, "outcome", "authorized")
			}
		}
		return nil
	}}, nil
}
