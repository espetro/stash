package mcpserver

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteServerCard(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "mcp-server-card.json")
	if err := WriteServerCard(path, "/usr/local/bin/stash-daemon"); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var card struct {
		Servers []struct {
			Name     string   `json:"name"`
			Transport string  `json:"transport"`
			Command  string   `json:"command"`
			Tools    []struct{ Name string } `json:"tools"`
		} `json:"servers"`
	}
	if err := json.Unmarshal(b, &card); err != nil {
		t.Fatal(err)
	}
	if len(card.Servers) != 3 {
		t.Fatalf("expected 3 servers, got %d", len(card.Servers))
	}
	daemon := card.Servers[2]
	if daemon.Name != "stash-daemon" || daemon.Transport != "stdio" || daemon.Command != "/usr/local/bin/stash-daemon" {
		t.Fatalf("daemon entry: %+v", daemon)
	}
	if len(daemon.Tools) != 8 {
		t.Fatalf("daemon card tools: %d", len(daemon.Tools))
	}
	if daemon.Tools[0].Name != "stash_snapshot_tabs" || daemon.Tools[7].Name != "stash_decode" {
		t.Fatalf("card tool names drifted: %+v", daemon.Tools)
	}
}
