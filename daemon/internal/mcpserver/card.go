package mcpserver

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// WriteServerCard writes the daemon serverCard to <config>/mcp-server-card.json
// on startup. The card mirrors serverCardResponse (packages/server-core/src/mcp.ts)
// and adds a third servers entry for the daemon stdio transport.
func WriteServerCard(cardPath, binaryPath string) error {
	tools := make([]map[string]string, len(Tools))
	for i, t := range Tools {
		tools[i] = map[string]string{"name": t.Name, "description": t.Description}
	}
	card := map[string]any{
		"name":    "stash",
		"version": "0.1.0",
		"servers": []map[string]any{
			{"name": "stash-shortener", "transport": "streamable-http", "url": "https://stash.illo.fyi/mcp", "tools": tools},
			{"name": "stash-extension", "transport": "extension-port", "portName": "mcp", "tools": tools},
			{"name": "stash-daemon", "transport": "stdio", "command": binaryPath, "tools": tools},
		},
	}
	if err := os.MkdirAll(filepath.Dir(cardPath), 0o700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(card, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(cardPath, b, 0o600)
}
