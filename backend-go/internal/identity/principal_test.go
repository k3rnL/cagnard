package identity

import "testing"

func TestQualifiedIdentityAndStorageKeys(t *testing.T) {
	seen := map[string]bool{}
	for _, parts := range [][3]string{{"local", "", "alice"}, {"company", "https://idp", "alice"}, {"company", "https://other", "alice"}, {"a:b", "c", "d"}, {"a", "b:c", "d"}, {"a", "b", "c:d"}} {
		id := ID(parts[0], parts[1], parts[2])
		if seen[id] {
			t.Fatal("identity collision")
		}
		seen[id] = true
		if !ValidStorageKey(DefaultStorageKey(id)) {
			t.Fatal("unsafe derived key")
		}
	}
	for _, key := range []string{"..", ".", "../alice", "a/b", "a\\b", "", "a?b"} {
		if ValidStorageKey(key) {
			t.Fatalf("accepted %q", key)
		}
	}
}
