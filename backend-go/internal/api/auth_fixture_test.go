package api

import (
	auth "github.com/k3rnl/cagnard/backend-go/internal/authn"
	"testing"
)

func testIdentity(t *testing.T, s *Server) auth.RequestIdentity {
	t.Helper()
	i, f := s.resolver.DevelopmentIdentity("alice")
	if f != nil {
		t.Fatal(f)
	}
	return i
}
