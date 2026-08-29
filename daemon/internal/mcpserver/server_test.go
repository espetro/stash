package mcpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/espetro/stash/daemon/internal/store"
)

func openStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "stash.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

// TestGoldenToolNames asserts the Go registry equals the checked-in snapshot
// of the TS EXTENSION_MCP_TOOLS table (any drift fails CI).
func TestGoldenToolNames(t *testing.T) {
	snap, err := LoadSnapshot()
	if err != nil {
		t.Fatal(err)
	}
	got := make([]ToolDef, len(Tools))
	for i, tl := range Tools {
		got[i] = ToolDef{Name: tl.Name, Description: tl.Description}
	}
	if !reflect.DeepEqual(got, snap) {
		t.Fatalf("tool table drift:\n got %+v\nwant %+v", got, snap)
	}
	want := []string{"stash_snapshot_tabs", "stash_list", "stash_get", "stash_create",
		"stash_update", "stash_delete", "stash_search", "stash_decode"}
	if err := ValidateNameSet(want); err != nil {
		t.Fatal(err)
	}
}

func call(t *testing.T, s *Server, method string, params any) map[string]any {
	t.Helper()
	req, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
	var buf bytes.Buffer
	if err := s.Serve(context.Background(), strings.NewReader(string(req)+"\n"), &buf); err != nil && err != io.EOF {
		t.Fatalf("serve: %v", err)
	}
	var resp Response
	if err := json.Unmarshal(buf.Bytes(), &resp); err != nil {
		t.Fatalf("resp: %v (%q)", err, buf.String())
	}
	var out map[string]any
	json.Unmarshal(resp.Result, &out)
	if out == nil {
		out = map[string]any{}
	}
	out["__rpc_error"] = resp.Error
	return out
}

func toolText(t *testing.T, out map[string]any) (string, bool) {
	t.Helper()
	content, _ := out["content"].([]any)
	if len(content) == 0 {
		t.Fatalf("no content: %v", out)
	}
	first := content[0].(map[string]any)
	text, _ := first["text"].(string)
	isErr, _ := out["isError"].(bool)
	return text, isErr
}

func TestToolsListMatchesExtensionNames(t *testing.T) {
	s := &Server{Store: openStore(t)}
	out := call(t, s, "tools/list", nil)
	tools, _ := out["tools"].([]any)
	if len(tools) != 8 {
		t.Fatalf("tools/list returned %d tools", len(tools))
	}
	names := []string{}
	for _, tl := range tools {
		m := tl.(map[string]any)
		names = append(names, m["name"].(string))
	}
	want := []string{"stash_snapshot_tabs", "stash_list", "stash_get", "stash_create",
		"stash_update", "stash_delete", "stash_search", "stash_decode"}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("name %d: got %s want %s", i, names[i], want[i])
		}
	}
}

func TestToolRoundTrip(t *testing.T) {
	s := &Server{Store: openStore(t)}
	out := call(t, s, "tools/call", map[string]any{"name": "stash_create", "arguments": map[string]any{
		"title": "Docs", "items": []map[string]any{{"url": "https://developer.mozilla.org", "title": "MDN"}},
	}})
	text, isErr := toolText(t, out)
	if isErr {
		t.Fatalf("create failed: %s", text)
	}
	var created map[string]any
	json.Unmarshal([]byte(text), &created)
	id, _ := created["id"].(string)
	if id == "" {
		t.Fatalf("no id: %s", text)
	}
	out = call(t, s, "tools/call", map[string]any{"name": "stash_get", "arguments": map[string]any{"id": id}})
	text, _ = toolText(t, out)
	if !strings.Contains(text, "MDN") {
		t.Fatalf("get: %s", text)
	}
	out = call(t, s, "tools/call", map[string]any{"name": "stash_list"})
	text, _ = toolText(t, out)
	if !strings.Contains(text, "Docs") {
		t.Fatalf("list: %s", text)
	}
	out = call(t, s, "tools/call", map[string]any{"name": "stash_search", "arguments": map[string]any{"query": "doc"}})
	text, _ = toolText(t, out)
	if !strings.Contains(text, "Docs") {
		t.Fatalf("search: %s", text)
	}
	out = call(t, s, "tools/call", map[string]any{"name": "stash_update", "arguments": map[string]any{"id": id, "title": "Docs v2"}})
	text, _ = toolText(t, out)
	if !strings.Contains(text, "Docs v2") {
		t.Fatalf("update: %s", text)
	}
	out = call(t, s, "tools/call", map[string]any{"name": "stash_delete", "arguments": map[string]any{"id": id}})
	text, isErr = toolText(t, out)
	if isErr || !strings.Contains(text, `"deleted":true`) {
		t.Fatalf("delete: %s %v", text, isErr)
	}
	out = call(t, s, "tools/call", map[string]any{"name": "stash_get", "arguments": map[string]any{"id": id}})
	text, _ = toolText(t, out)
	if !strings.Contains(text, "not_found") {
		t.Fatalf("expected not_found, got %s", text)
	}
}

// TestStashDecodeRealPayload decodes a real share-URL ?p= value from the
// canonical fixture set and asserts the decoded shape; a hand-crafted v5
// payload must surface the version error (v6-only at the tool boundary).
func TestStashDecodeRealPayload(t *testing.T) {
	fixtures := decodeFixtures(t)
	var five fixture
	for _, f := range fixtures {
		if f.Name == "five-tabs" {
			five = f
		}
	}
	s := &Server{Store: openStore(t)}
	out := call(t, s, "tools/call", map[string]any{"name": "stash_decode", "arguments": map[string]any{"payload": strings.TrimPrefix(five.Fragment, "#p=")}})
	text, isErr := toolText(t, out)
	if isErr {
		t.Fatalf("decode five-tabs: %s", text)
	}
	if !strings.Contains(text, `"itemCount"` ) && !strings.Contains(text, `"items"`) {
		t.Fatalf("decode output missing items: %s", text)
	}
	if !strings.Contains(text, "css-tricks.com") {
		t.Fatalf("decode output missing expected item url: %s", text)
	}

	// Hand-crafted v5 payload: msgpack map with v=5, base64url, R prefix.
	v5 := encodeV5Payload(t, 5)
	out = call(t, s, "tools/call", map[string]any{"name": "stash_decode", "arguments": map[string]any{"payload": v5}})
	text, isErr = toolText(t, out)
	if !isErr || !strings.Contains(text, "Unsupported payload version") {
		t.Fatalf("v5 payload: want Unsupported payload version, got %s (isErr=%v)", text, isErr)
	}
}

func TestSnapshotTabsNoBrowser(t *testing.T) {
	s := &Server{Store: openStore(t)}
	out := call(t, s, "tools/call", map[string]any{"name": "stash_snapshot_tabs"})
	text, isErr := toolText(t, out)
	if !isErr || !strings.Contains(text, "no_browser_attached") {
		t.Fatalf("snapshot: %s %v", text, isErr)
	}
}

func TestUnknownMethod(t *testing.T) {
	s := &Server{Store: openStore(t)}
	out := call(t, s, "no/such/method", nil)
	if out["__rpc_error"] == nil {
		t.Fatal("expected rpc error")
	}
}

// TestHarnessE2E spawns the built daemon binary and speaks MCP over stdio.
func TestHarnessE2E(t *testing.T) {
	if testing.Short() {
		t.Skip("short mode")
	}
	bin := t.TempDir() + "/stash-daemon"
	build := exec.Command("go", "build", "-o", bin, "github.com/espetro/stash/daemon/cmd/stash-daemon")
	build.Dir = "../.."
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build daemon: %v\n%s", err, out)
	}
	cfg := t.TempDir()
	cmd := exec.Command(bin, "--config-dir", cfg, "serve")
	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { stdin.Close(); cmd.Process.Kill(); cmd.Wait() })
	req, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
	stdin.Write(append(req, '\n'))
	sc := bufioScanner(stdout)
	if !sc.Scan() {
		t.Fatal("no response")
	}
	var resp Response
	if err := json.Unmarshal(sc.Bytes(), &resp); err != nil {
		t.Fatalf("bad response: %v: %s", err, sc.Bytes())
	}
	var result struct {
		Tools []struct{ Name string } `json:"tools"`
	}
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Tools) != 8 {
		t.Fatalf("harness got %d tools", len(result.Tools))
	}
	names := []string{}
	for _, tl := range result.Tools {
		names = append(names, tl.Name)
	}
	want := []string{"stash_snapshot_tabs", "stash_list", "stash_get", "stash_create",
		"stash_update", "stash_delete", "stash_search", "stash_decode"}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("harness name %d: got %s want %s", i, names[i], want[i])
		}
	}
}

func encodeV5Payload(t *testing.T, version int64) string {
	t.Helper()
	mp, err := msgpackMarshal(map[string]any{"v": version, "e": int64(9999999999), "i": [][]string{{"https://github.com", "GitHub"}}})
	if err != nil {
		t.Fatal(err)
	}
	return "R" + base64RawURL(mp)
}
