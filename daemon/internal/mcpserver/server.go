package mcpserver

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync"

	"github.com/espetro/stash/daemon/internal/store"
)

// Server routes MCP JSON-RPC over an io.Reader/io.Writer pair (stdio or the
// NM port). One registry, two transports.
type Server struct {
	Store *store.Store
	Log   *slog.Logger

	// SnapshotFn, when non-nil and at least one browser is attached, serves
	// stash_snapshot_tabs. In F2 without a browser it stays nil and the tool
	// returns the defined no_browser_attached error.
	SnapshotFn func(ctx context.Context) (string, error)
}

// Serve reads newline-delimited JSON-RPC requests until EOF.
func (s *Server) Serve(ctx context.Context, r io.Reader, w io.Writer) error {
	br := bufio.NewReader(r)
	var mu sync.Mutex // serialize writes
	for {
		line, err := br.ReadString('\n')
		if line == "" && err != nil {
			return err
		}
		line = strings.TrimSpace(line)
		if line != "" {
			if resp := s.handle(ctx, []byte(line)); resp != nil {
				b, jerr := json.Marshal(resp)
				if jerr == nil {
					mu.Lock()
					w.Write(append(b, '\n'))
					mu.Unlock()
				}
			}
		}
		if err != nil {
			return err
		}
	}
}

// Handle processes one raw JSON-RPC request and returns the response
// (nil for notifications). Exported so the NM host mode can reuse it.
func (s *Server) Handle(ctx context.Context, raw []byte) *Response {
	var req Request
	if err := json.Unmarshal(raw, &req); err != nil {
		return &Response{JSONRPC: "2.0", ID: json.RawMessage("null"),
			Error: &RPCError{Code: CodeParseError, Message: "parse error"}}
	}
	if req.Method == "" {
		return nil
	}
	resp := s.dispatch(ctx, &req)
	if resp == nil {
		return nil
	}
	resp.ID = req.ID
	return resp
}

func (s *Server) handle(ctx context.Context, raw []byte) *Response { return s.Handle(ctx, raw) }

func (s *Server) dispatch(ctx context.Context, req *Request) *Response {
	switch req.Method {
	case "initialize":
		result, _ := json.Marshal(map[string]any{
			"protocolVersion": "2024-11-05",
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": "stash-daemon", "version": version},
		})
		return &Response{JSONRPC: "2.0", Result: result}
	case "notifications/initialized":
		return nil
	case "ping":
		return &Response{JSONRPC: "2.0", Result: json.RawMessage(`{}`)}
	case "tools/list":
		return &Response{JSONRPC: "2.0", Result: BuildToolsListResult()}
	case "tools/call":
		return s.callTool(ctx, req)
	default:
		return &Response{JSONRPC: "2.0", Error: &RPCError{Code: CodeMethodNotFound, Message: "method not found: " + req.Method}}
	}
}

func (s *Server) callTool(ctx context.Context, req *Request) *Response {
	var params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(NormalizePayload(req.Params), &params); err != nil {
		return &Response{JSONRPC: "2.0", Error: &RPCError{Code: CodeInvalidParams, Message: "bad params"}}
	}
	args := NormalizePayload(params.Arguments)
	var a map[string]any
	json.Unmarshal(args, &a)

	text, isErr := s.runTool(ctx, params.Name, a)
	if isErr {
		return &Response{JSONRPC: "2.0", Result: TextResultErr(text)}
	}
	return &Response{JSONRPC: "2.0", Result: TextResult(text)}
}

func str(m map[string]any, k string) string {
	v, _ := m[k].(string)
	return v
}

// runTool executes a tool and returns (payload, isError).
func (s *Server) runTool(ctx context.Context, name string, a map[string]any) (string, bool) {
	switch name {
	case "stash_snapshot_tabs":
		if s.SnapshotFn == nil {
			return CallError("no_browser_attached", "no browser attached: pair the extension via native messaging; run stash-daemon doctor to diagnose"), true
		}
		out, err := s.SnapshotFn(ctx)
		return out, err != nil
	case "stash_list":
		recs, err := s.Store.ListRecords()
		if err != nil {
			return CallError("internal_error", err.Error()), true
		}
		out, _ := json.Marshal(map[string]any{"stashes": summaries(recs)})
		return string(out), false
	case "stash_get":
		rec, err := s.Store.GetRecord(str(a, "id"))
		if err != nil {
			return CallError("internal_error", err.Error()), true
		}
		if rec == nil {
			return CallError("not_found", "no stash with that id"), true
		}
		return stashJSON(rec), false
	case "stash_create":
		items, _ := json.Marshal(a["items"])
		id := newID()
		now := nowMillis()
		rec := store.Record{
			ID: id, Title: strOr(a, "title", ""), URL: firstURL(items),
			ItemsJSON: string(items), CreatedAt: now, UpdatedAt: now, CRDTSeq: now,
		}
		if err := s.Store.PutRecord(rec, []byte(items), "local", "create"); err != nil {
			return CallError("internal_error", err.Error()), true
		}
		return stashJSON(&rec), false
	case "stash_update":
		id := str(a, "id")
		rec, err := s.Store.GetRecord(id)
		if err != nil {
			return CallError("internal_error", err.Error()), true
		}
		if rec == nil {
			return CallError("not_found", "no stash with that id"), true
		}
		if t, ok := a["title"].(string); ok {
			rec.Title = t
		}
		if it, ok := a["items"]; ok {
			b, _ := json.Marshal(it)
			rec.ItemsJSON = string(b)
			rec.URL = firstURL(b)
		}
		rec.UpdatedAt = nowMillis()
		if err := s.Store.PutRecord(*rec, []byte(rec.ItemsJSON), "local", "update"); err != nil {
			return CallError("internal_error", err.Error()), true
		}
		return stashJSON(rec), false
	case "stash_delete":
		ok, err := s.Store.DeleteRecord(str(a, "id"))
		if err != nil {
			return CallError("internal_error", err.Error()), true
		}
		if !ok {
			return CallError("not_found", "no stash with that id"), true
		}
		out, _ := json.Marshal(map[string]any{"id": str(a, "id"), "deleted": true})
		return string(out), false
	case "stash_search":
		recs, err := s.Store.SearchRecords(str(a, "query"))
		if err != nil {
			return CallError("internal_error", err.Error()), true
		}
		out, _ := json.Marshal(map[string]any{"stashes": summaries(recs)})
		return string(out), false
	case "stash_decode":
		return CallError("not_implemented", "stash_decode is not implemented until codec port (F3)"), true
	default:
		return CallError("unknown_tool", fmt.Sprintf("unknown tool %q", name)), true
	}
}

func summaries(recs []store.Record) []Summary {
	out := make([]Summary, 0, len(recs))
	for _, r := range recs {
		var items []json.RawMessage
		json.Unmarshal([]byte(r.ItemsJSON), &items)
		tags := []string{}
		out = append(out, Summary{ID: r.ID, Title: r.Title, Tags: tags, ItemCount: len(items), CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt})
	}
	return out
}

func stashJSON(r *store.Record) string {
	var items json.RawMessage = json.RawMessage(r.ItemsJSON)
	b, _ := json.Marshal(map[string]any{
		"id": r.ID, "title": r.Title, "items": items,
		"tags": []string{}, "note": "",
		"createdAt": r.CreatedAt, "updatedAt": r.UpdatedAt,
	})
	return string(b)
}

func firstURL(itemsJSON []byte) string {
	var items []map[string]any
	if json.Unmarshal(itemsJSON, &items) == nil && len(items) > 0 {
		u, _ := items[0]["url"].(string)
		return u
	}
	return ""
}

func strOr(m map[string]any, k, def string) string {
	if v, ok := m[k].(string); ok && v != "" {
		return v
	}
	return def
}
