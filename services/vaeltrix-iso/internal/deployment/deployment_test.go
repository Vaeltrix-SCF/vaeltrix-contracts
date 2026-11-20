package deployment

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func repoFile(t *testing.T, rel string) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		p := filepath.Join(dir, rel)
		if _, err := os.Stat(p); err == nil {
			return p
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("%s not found above package dir", rel)
		}
		dir = parent
	}
}

func TestLoadTestnetManifest(t *testing.T) {
	m, err := Load(repoFile(t, "deployments/testnet.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{m.Contracts.Bond, m.Contracts.Registry, m.Contracts.Scoreboard} {
		if len(id) != 56 || !strings.HasPrefix(id, "C") {
			t.Fatalf("bad contract id %q", id)
		}
	}
	if m.StartLedger == 0 || !strings.HasPrefix(m.RPCURL, "https://") {
		t.Fatalf("bad manifest: %+v", m)
	}
}
