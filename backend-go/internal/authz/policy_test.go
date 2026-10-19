package authz

import (
	"github.com/k3rnl/cagnard/backend-go/internal/config"
	"github.com/k3rnl/cagnard/backend-go/internal/identity"
	"slices"
	"testing"
)

func TestScopedAdditivePolicy(t *testing.T) {
	c := &config.CagnardConfig{Authorization: config.AuthorizationConfig{
		Roles: []config.RoleConfig{{ID: "reader", Actions: []string{identity.List, identity.Read}}, {ID: "writer", Actions: []string{identity.Write}}},
		Bindings: []config.BindingConfig{
			{Subjects: []config.SubjectConfig{{Group: "engineering"}}, Roles: []string{"reader"}, Roots: []config.RootRef{{Tunnel: "global", RootID: "shared"}}},
			{Subjects: []config.SubjectConfig{{ProviderID: "local", Subject: "alice"}}, Roles: []string{"writer"}, Roots: []config.RootRef{{Tunnel: "global", RootID: "shared"}}},
			{Subjects: []config.SubjectConfig{{Authenticated: true}}, Roles: []string{"reader"}, Roots: []config.RootRef{{Tunnel: "global", RootID: "handbook"}}},
		},
	}}
	p := New(c)
	for _, test := range []struct {
		provider, subject, group, tunnel, root string
		want                                   []string
	}{
		{"local", "alice", "engineering", "global", "shared", []string{identity.List, identity.Read, identity.Write}},
		{"oidc", "alice", "engineering", "global", "shared", []string{identity.List, identity.Read}},
		{"oidc", "alice", "admin", "global", "shared", []string{}},
		{"local", "alice", "engineering", "personal", "shared", []string{}},
		{"oidc", "nobody", "", "global", "handbook", []string{identity.List, identity.Read}},
	} {
		actor := identity.Principal{Profile: identity.Profile{ID: identity.ID(test.provider, "", test.subject), ProviderID: test.provider, Subject: test.subject, Groups: []string{test.group}}}
		got := p.Actions(actor, test.tunnel, test.root)
		if !slices.Equal(got, test.want) {
			t.Fatalf("%+v got %v", test, got)
		}
	}
	if len(p.Actions(identity.Principal{}, "global", "handbook")) != 0 {
		t.Fatal("anonymous principal received authenticated grant")
	}
}
