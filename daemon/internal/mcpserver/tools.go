// Package mcpserver implements the minimal stdio MCP surface (JSON-RPC 2.0,
// newline-delimited) with the frozen 8-tool registry mirroring
// packages/server-core/src/mcp.ts EXTENSION_MCP_TOOLS.
package mcpserver

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed testdata/extension_tools_snapshot.json
var snapshotJSON []byte

// ToolDef is one entry of the registry (name, description, inputSchema).
type ToolDef struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`
}

func rawSchema(s string) json.RawMessage { return json.RawMessage(s) }

var itemSchema = `{"type":"object","properties":{"url":{"type":"string"},"title":{"type":"string"}},"required":["url","title"]}`

// Tools is the frozen registry, in the same order as the TS table. Names and
// descriptions must match testdata/extension_tools_snapshot.json exactly
// (golden test). Input schemas mirror apps/extension/lib/mcp/server.ts:61-142.
var Tools = []ToolDef{
	{
		Name:        "stash_snapshot_tabs",
		Description: "Read-only snapshot of the tabs currently open in this browser window (url + title).",
		InputSchema: rawSchema(`{"type":"object","properties":{"browser":{"type":"string","description":"Optional pairing label of the browser to ask (see stash-daemon status); defaults to the most recently active browser"}}}`),
	},
	{
		Name:        "stash_list",
		Description: "List local stashes (id, title, tags, item counts, timestamps).",
		InputSchema: rawSchema(`{"type":"object","properties":{}}`),
	},
	{
		Name:        "stash_get",
		Description: "Fetch a local stash by id, including its full item list.",
		InputSchema: rawSchema(`{"type":"object","properties":{"id":{"type":"string","description":"The stash id"}},"required":["id"]}`),
	},
	{
		Name:        "stash_create",
		Description: "Create and persist a new local stash from a list of URLs (with optional titles), title, tags and note.",
		InputSchema: rawSchema(`{"type":"object","properties":{"title":{"type":"string","description":"Optional title for the stash"},"tags":{"type":"array","items":{"type":"string"},"description":"Optional tags"},"note":{"type":"string","description":"Optional freeform note"},"items":{"type":"array","items":` + itemSchema + `,"minItems":1,"description":"Items to include in the stash"}},"required":["items"]}`),
	},
	{
		Name:        "stash_update",
		Description: "Update a local stash's title, tags, note, or items by id.",
		InputSchema: rawSchema(`{"type":"object","properties":{"id":{"type":"string","description":"The stash id"},"title":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"note":{"type":"string"},"items":{"type":"array","items":` + itemSchema + `}},"required":["id"]}`),
	},
	{
		Name:        "stash_delete",
		Description: "Delete a local stash by id.",
		InputSchema: rawSchema(`{"type":"object","properties":{"id":{"type":"string","description":"The stash id"}},"required":["id"]}`),
	},
	{
		Name:        "stash_search",
		Description: "Search local stashes by a substring match over title, tags and note.",
		InputSchema: rawSchema(`{"type":"object","properties":{"query":{"type":"string","description":"Search query"}},"required":["query"]}`),
	},
	{
		Name:        "stash_decode",
		Description: "Decode a stash payload string (the ?p= value from a stash share URL) into its title, items, tags and note.",
		InputSchema: rawSchema(`{"type":"object","properties":{"payload":{"type":"string","description":"The encoded payload string (p param value from a share URL)"}},"required":["payload"]}`),
	},
}

// Snapshot is the checked-in JSON snapshot of the TS tool table.
type Snapshot struct {
	Tools []ToolDef `json:"tools"`
}

// LoadSnapshot parses the checked-in snapshot.
func LoadSnapshot() ([]ToolDef, error) {
	var raw []struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(snapshotJSON, &raw); err != nil {
		return nil, err
	}
	out := make([]ToolDef, len(raw))
	for i, r := range raw {
		out[i] = ToolDef{Name: r.Name, Description: r.Description}
	}
	return out, nil
}

// ToolNames returns the registry names in order.
func ToolNames() []string {
	out := make([]string, len(Tools))
	for i, t := range Tools {
		out[i] = t.Name
	}
	return out
}

// JSON-RPC types (newline-delimited stdio framing).

// Request is an incoming JSON-RPC request or notification.
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// Response is an outgoing JSON-RPC response.
type Response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
}

// RPCError is a JSON-RPC error object.
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Standard JSON-RPC error codes used here.
const (
	CodeParseError     = -32700
	CodeInvalidRequest = -32600
	CodeMethodNotFound = -32601
	CodeInvalidParams  = -32602
	CodeInternalError  = -32603
)

// SnapshotError is a defined stash_snapshot_tabs tool error (F4.W1): the
// code surfaces verbatim as the CallError code (no_browser_attached,
// browser_not_found, browser_timeout, browser_disconnected, browser_error).
type SnapshotError struct {
	Code    string
	Message string
}

func (e *SnapshotError) Error() string     { return e.Message }
func (e *SnapshotError) ErrorCode() string { return e.Code }

// CallError is the MCP tool-error payload (isError result, not RPC error).
func CallError(code, message string) string {
	b, _ := json.Marshal(map[string]any{"error": map[string]any{"code": code, "message": message}})
	return string(b)
}

// TextResult wraps a JSON payload as an MCP text content result.
func TextResult(payload string) json.RawMessage {
	b, _ := json.Marshal(map[string]any{
		"content": []map[string]any{{"type": "text", "text": payload}},
	})
	return b
}

// TextResultErr is a text content result flagged as a tool error.
func TextResultErr(payload string) json.RawMessage {
	b, _ := json.Marshal(map[string]any{
		"content": []map[string]any{{"type": "text", "text": payload}},
		"isError": true,
	})
	return b
}

// Summary is the stash summary shape returned by list/get/create/update.
type Summary struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Tags      []string `json:"tags"`
	ItemCount int      `json:"itemCount"`
	CreatedAt int64    `json:"createdAt"`
	UpdatedAt int64    `json:"updatedAt"`
}

// BuildToolsListResult builds the tools/list result payload.
func BuildToolsListResult() json.RawMessage {
	b, _ := json.Marshal(map[string]any{"tools": Tools})
	return b
}

// ValidateNameSet returns an error if the registry names do not match the
// expected frozen names (used by tests and doctor).
func ValidateNameSet(expected []string) error {
	got := ToolNames()
	if len(got) != len(expected) {
		return fmt.Errorf("tool count %d != %d", len(got), len(expected))
	}
	for i := range got {
		if got[i] != expected[i] {
			return fmt.Errorf("tool %d: got %s want %s", i, got[i], expected[i])
		}
	}
	return nil
}

// NormalizePayload strips whitespace-only payloads to "{}" for convenience.
func NormalizePayload(p json.RawMessage) json.RawMessage {
	if len(strings.TrimSpace(string(p))) == 0 {
		return json.RawMessage(`{}`)
	}
	return p
}
