package mcpserver

// F4.W3/W4: stash_snapshot_tabs routing through SnapshotFn (the Hub fan-out
// lives in internal/natmsg; here we pin the MCP surface: the browser
// argument plumb-through and defined error codes as CallError payloads).

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func callSnapshot(t *testing.T, s *Server, args string) (string, bool) {
	t.Helper()
	params := map[string]any{"name": "stash_snapshot_tabs", "arguments": json.RawMessage(args)}
	req, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": params})
	resp := s.Handle(context.Background(), req)
	if resp == nil || resp.Result == nil {
		t.Fatalf("no result: %+v", resp)
	}
	var out struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		IsError bool `json:"isError"`
	}
	if err := json.Unmarshal(resp.Result, &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Content) == 0 {
		t.Fatal("no content")
	}
	return out.Content[0].Text, out.IsError
}

func TestSnapshotTabsRouting(t *testing.T) {
	var gotBrowser string
	s := &Server{SnapshotFn: func(ctx context.Context, browser string) (string, error) {
		gotBrowser = browser
		return `{"items":[{"url":"https://x.example","title":"X"}],"answeredBy":"alpha"}`, nil
	}}
	out, isErr := callSnapshot(t, s, `{"browser":"alpha"}`)
	if isErr || gotBrowser != "alpha" {
		t.Fatalf("routing: browser=%q isErr=%v out=%s", gotBrowser, isErr, out)
	}
	var res struct {
		Items      []map[string]any `json:"items"`
		AnsweredBy string           `json:"answeredBy"`
	}
	if err := json.Unmarshal([]byte(out), &res); err != nil {
		t.Fatal(err)
	}
	if res.AnsweredBy != "alpha" || len(res.Items) != 1 {
		t.Fatalf("payload: %s", out)
	}
}

func TestSnapshotTabsDefinedErrors(t *testing.T) {
	cases := []struct {
		err  error
		code string
	}{
		{&SnapshotError{Code: "no_browser_attached", Message: "no browser attached"}, "no_browser_attached"},
		{&SnapshotError{Code: "browser_not_found", Message: "unknown label"}, "browser_not_found"},
		{&SnapshotError{Code: "browser_timeout", Message: "timed out"}, "browser_timeout"},
		{&SnapshotError{Code: "browser_disconnected", Message: "gone"}, "browser_disconnected"},
		{errors.New("boom"), "browser_error"},
	}
	for _, tc := range cases {
		s := &Server{SnapshotFn: func(ctx context.Context, browser string) (string, error) {
			return "", tc.err
		}}
		out, isErr := callSnapshot(t, s, `{}`)
		if !isErr {
			t.Fatalf("%s: expected isError", tc.code)
		}
		if !strings.Contains(out, tc.code) {
			t.Fatalf("got %q want code %q", out, tc.code)
		}
	}
}

func TestSnapshotTabsNoFnStillDefinedError(t *testing.T) {
	s := &Server{}
	out, isErr := callSnapshot(t, s, `{}`)
	if !isErr {
		t.Fatal("expected isError")
	}
	if !strings.Contains(out, "no_browser_attached") {
		t.Fatalf("want no_browser_attached: %s", out)
	}
}

func TestSnapshotTabsBrowserArgInSchema(t *testing.T) {
	for _, tl := range Tools {
		if tl.Name != "stash_snapshot_tabs" {
			continue
		}
		var schema struct {
			Properties map[string]struct {
				Type        string `json:"type"`
				Description string `json:"description"`
			} `json:"properties"`
			Required []string `json:"required"`
		}
		if err := json.Unmarshal(tl.InputSchema, &schema); err != nil {
			t.Fatal(err)
		}
		b, ok := schema.Properties["browser"]
		if !ok || b.Type != "string" || b.Description == "" {
			t.Fatalf("browser arg missing from schema: %s", tl.InputSchema)
		}
		if len(schema.Required) != 0 {
			t.Fatal("browser arg must stay optional")
		}
	}
}
