package mcpserver

// Plan .agents/plans/2026-10-04-daemon-store-extension-library.md §3.4/§3.8:
// the MCP write tools round-trip the full StashRecord fields (tags, note,
// kept) through the store via ApplyChange, and tombstones never leak into
// list/get/search results.

import (
	"database/sql"
	"encoding/json"
	"strings"
	"testing"

	"github.com/espetro/stash/daemon/internal/store"
)

// toolCall invokes one MCP tool and returns its text payload and isError flag.
func toolCall(t *testing.T, s *Server, name string, args map[string]any) (string, bool) {
	t.Helper()
	out := call(t, s, "tools/call", map[string]any{"name": name, "arguments": args})
	return toolText(t, out)
}

// mustToolCall asserts the call succeeded and returns the decoded JSON text.
func mustToolCall(t *testing.T, s *Server, name string, args map[string]any) map[string]any {
	t.Helper()
	text, isErr := toolCall(t, s, name, args)
	if isErr {
		t.Fatalf("%s failed: %s", name, text)
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		t.Fatalf("%s: bad json %q: %v", name, text, err)
	}
	return out
}

// seedRecord inserts a row directly with an old updated_at so a same-origin
// tool write always wins LWW (a create+update inside one millisecond would
// tie on updated_at and lose the origin tie-break, silently dropping it).
func seedRecord(t *testing.T, s *Server, rec *store.Record) {
	t.Helper()
	old := nowMillis() - 60_000
	rec.CreatedAt = old
	if _, err := s.Store.ApplyChange(store.Change{
		Op: "create", ID: rec.ID, Record: rec, UpdatedAt: old, Origin: "daemon",
	}); err != nil {
		t.Fatal(err)
	}
}

func wantTags(t *testing.T, doc map[string]any, want ...string) {
	t.Helper()
	raw, _ := doc["tags"].([]any)
	got := make([]string, 0, len(raw))
	for _, v := range raw {
		s, _ := v.(string)
		got = append(got, s)
	}
	if len(got) != len(want) {
		t.Fatalf("tags: got %v want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("tags: got %v want %v", got, want)
		}
	}
}

func itemURLs(doc map[string]any) []string {
	raw, _ := doc["items"].([]any)
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		m, _ := v.(map[string]any)
		u, _ := m["url"].(string)
		out = append(out, u)
	}
	return out
}

func stashIDs(t *testing.T, text string) map[string]bool {
	t.Helper()
	var res struct {
		Stashes []struct {
			ID string `json:"id"`
		} `json:"stashes"`
	}
	if err := json.Unmarshal([]byte(text), &res); err != nil {
		t.Fatalf("stashes: bad json %q: %v", text, err)
	}
	out := map[string]bool{}
	for _, st := range res.Stashes {
		out[st.ID] = true
	}
	return out
}

func TestStashCreateRoundTripsTagsNoteKept(t *testing.T) {
	s := &Server{Store: openStore(t)}
	created := mustToolCall(t, s, "stash_create", map[string]any{
		"title": "Papers",
		"tags":  []string{"research", "go"},
		"note":  "read the generics proposal",
		"items": []map[string]any{{"url": "https://go.dev", "title": "Go"}},
	})
	id, _ := created["id"].(string)
	if id == "" {
		t.Fatalf("create: no id in %v", created)
	}
	if created["kept"] != true {
		t.Fatalf("create kept: got %v want true (default)", created["kept"])
	}

	got := mustToolCall(t, s, "stash_get", map[string]any{"id": id})
	if got["title"] != "Papers" || got["note"] != "read the generics proposal" || got["kept"] != true {
		t.Fatalf("get: %v", got)
	}
	wantTags(t, got, "research", "go")
	if urls := itemURLs(got); len(urls) != 1 || urls[0] != "https://go.dev" {
		t.Fatalf("get items: %v", got["items"])
	}

	// kept:false marks the record Recent.
	recent := mustToolCall(t, s, "stash_create", map[string]any{
		"kept":  false,
		"items": []map[string]any{{"url": "https://example.com", "title": "Ex"}},
	})
	if recent["kept"] != false {
		t.Fatalf("create kept:false: %v", recent)
	}
	got = mustToolCall(t, s, "stash_get", map[string]any{"id": recent["id"]})
	if got["kept"] != false {
		t.Fatalf("get kept: got %v want false (Recent)", got["kept"])
	}
}

func TestStashUpdateMutatesAndPreserves(t *testing.T) {
	s := &Server{Store: openStore(t)}
	seedRecord(t, s, &store.Record{
		ID: "seed1", Title: "Orig", URL: "https://a.example",
		ItemsJSON: `[{"url":"https://a.example","title":"A"}]`,
		TagsJSON:  `["old"]`, Note: sql.NullString{String: "old note", Valid: true},
		Kept: true, SharesJSON: "[]", ExtraJSON: "{}",
	})

	updated := mustToolCall(t, s, "stash_update", map[string]any{
		"id":    "seed1",
		"title": "New title",
		"tags":  []string{"newtag"},
		"note":  "new note",
		"items": []map[string]any{{"url": "https://b.example", "title": "B"}},
		"kept":  false,
	})
	if updated["title"] != "New title" || updated["note"] != "new note" || updated["kept"] != false {
		t.Fatalf("update response: %v", updated)
	}
	got := mustToolCall(t, s, "stash_get", map[string]any{"id": "seed1"})
	if got["title"] != "New title" || got["note"] != "new note" || got["kept"] != false {
		t.Fatalf("get after update: %v", got)
	}
	wantTags(t, got, "newtag")
	if urls := itemURLs(got); len(urls) != 1 || urls[0] != "https://b.example" {
		t.Fatalf("get items after update: %v", got["items"])
	}

	// Omitted fields are preserved.
	mustToolCall(t, s, "stash_update", map[string]any{"id": "seed1", "title": "Title only"})
	got = mustToolCall(t, s, "stash_get", map[string]any{"id": "seed1"})
	if got["title"] != "Title only" || got["note"] != "new note" || got["kept"] != false {
		t.Fatalf("get after partial update: %v", got)
	}
	wantTags(t, got, "newtag")
	if urls := itemURLs(got); len(urls) != 1 || urls[0] != "https://b.example" {
		t.Fatalf("items after partial update: %v", got["items"])
	}

	// Unknown id is a defined not_found error, not a crash.
	text, isErr := toolCall(t, s, "stash_update", map[string]any{"id": "nope", "title": "x"})
	if !isErr || !strings.Contains(text, "not_found") {
		t.Fatalf("update missing id: %s %v", text, isErr)
	}
}

func TestStashDeleteNotFoundAndRemoves(t *testing.T) {
	s := &Server{Store: openStore(t)}

	text, isErr := toolCall(t, s, "stash_delete", map[string]any{"id": "nope"})
	if !isErr || !strings.Contains(text, "not_found") {
		t.Fatalf("delete missing id: %s %v", text, isErr)
	}

	created := mustToolCall(t, s, "stash_create", map[string]any{
		"items": []map[string]any{{"url": "https://x.example", "title": "X"}},
	})
	id := created["id"].(string)
	text, isErr = toolCall(t, s, "stash_delete", map[string]any{"id": id})
	if isErr || !strings.Contains(text, `"deleted":true`) {
		t.Fatalf("delete: %s %v", text, isErr)
	}

	// Gone from get and list.
	text, isErr = toolCall(t, s, "stash_get", map[string]any{"id": id})
	if !isErr || !strings.Contains(text, "not_found") {
		t.Fatalf("get deleted: %s %v", text, isErr)
	}
	text, isErr = toolCall(t, s, "stash_list", nil)
	if isErr || stashIDs(t, text)[id] {
		t.Fatalf("list still shows deleted id: %s", text)
	}

	// Deleting a tombstone is still not_found.
	text, isErr = toolCall(t, s, "stash_delete", map[string]any{"id": id})
	if !isErr || !strings.Contains(text, "not_found") {
		t.Fatalf("re-delete: %s %v", text, isErr)
	}
}

func TestStashSearchMatchesTagsNoteSkipsTombstones(t *testing.T) {
	s := &Server{Store: openStore(t)}
	// Tag-only match: neither title nor items contain the query.
	tagged := mustToolCall(t, s, "stash_create", map[string]any{
		"title": "Alpha",
		"tags":  []string{"research"},
		"items": []map[string]any{{"url": "https://alpha.example", "title": "A"}},
	})
	// Note-only match.
	noted := mustToolCall(t, s, "stash_create", map[string]any{
		"title": "Beta",
		"note":  "field notes on research methods",
		"items": []map[string]any{{"url": "https://beta.example", "title": "B"}},
	})
	// A tombstone matching the query must not come back.
	gone := mustToolCall(t, s, "stash_create", map[string]any{
		"title": "Gamma",
		"tags":  []string{"research"},
		"items": []map[string]any{{"url": "https://gamma.example", "title": "G"}},
	})
	mustToolCall(t, s, "stash_delete", map[string]any{"id": gone["id"]})

	text, isErr := toolCall(t, s, "stash_search", map[string]any{"query": "research"})
	if isErr {
		t.Fatalf("search: %s", text)
	}
	ids := stashIDs(t, text)
	if !ids[tagged["id"].(string)] {
		t.Fatalf("search missed tags_json match: %s", text)
	}
	if !ids[noted["id"].(string)] {
		t.Fatalf("search missed note match: %s", text)
	}
	if ids[gone["id"].(string)] {
		t.Fatalf("search returned a tombstone: %s", text)
	}
}

func TestListAndSearchSummariesIncludeKept(t *testing.T) {
	s := &Server{Store: openStore(t)}
	kept := mustToolCall(t, s, "stash_create", map[string]any{
		"title": "Kept stash",
		"items": []map[string]any{{"url": "https://k.example", "title": "K"}},
	})
	recent := mustToolCall(t, s, "stash_create", map[string]any{
		"title": "Recent stash", "kept": false,
		"items": []map[string]any{{"url": "https://r.example", "title": "R"}},
	})

	assertKept := func(text, label string) {
		t.Helper()
		var res struct {
			Stashes []struct {
				ID   string `json:"id"`
				Kept *bool  `json:"kept"` // pointer: nil if the key is absent
			} `json:"stashes"`
		}
		if err := json.Unmarshal([]byte(text), &res); err != nil {
			t.Fatalf("%s: bad json %q: %v", label, text, err)
		}
		keptByID := map[string]*bool{}
		for _, st := range res.Stashes {
			keptByID[st.ID] = st.Kept
		}
		for id, want := range map[string]bool{kept["id"].(string): true, recent["id"].(string): false} {
			k, ok := keptByID[id]
			if !ok || k == nil {
				t.Fatalf("%s: summary for %s missing kept field: %s", label, id, text)
			}
			if *k != want {
				t.Fatalf("%s: kept for %s = %v want %v", label, id, *k, want)
			}
		}
	}

	text, isErr := toolCall(t, s, "stash_list", nil)
	if isErr {
		t.Fatalf("list: %s", text)
	}
	assertKept(text, "stash_list")

	text, isErr = toolCall(t, s, "stash_search", map[string]any{"query": "stash"})
	if isErr {
		t.Fatalf("search: %s", text)
	}
	assertKept(text, "stash_search")

	// stash_get exposes kept on the full record too.
	for id, want := range map[string]bool{kept["id"].(string): true, recent["id"].(string): false} {
		got := mustToolCall(t, s, "stash_get", map[string]any{"id": id})
		k, ok := got["kept"].(bool)
		if !ok || k != want {
			t.Fatalf("get %s: kept=%v want %v", id, got["kept"], want)
		}
	}
}

// TestKeptFlagInWriteToolSchemas pins the kept argument into the create and
// update input schemas (the golden snapshot only covers names/descriptions).
func TestKeptFlagInWriteToolSchemas(t *testing.T) {
	want := map[string]bool{"stash_create": false, "stash_update": false}
	for _, tl := range Tools {
		if _, ok := want[tl.Name]; !ok {
			continue
		}
		var schema struct {
			Properties map[string]struct {
				Type string `json:"type"`
			} `json:"properties"`
		}
		if err := json.Unmarshal(tl.InputSchema, &schema); err != nil {
			t.Fatal(err)
		}
		k, ok := schema.Properties["kept"]
		if !ok || k.Type != "boolean" {
			t.Fatalf("%s schema missing kept boolean: %s", tl.Name, tl.InputSchema)
		}
		want[tl.Name] = true
	}
	for name, seen := range want {
		if !seen {
			t.Fatalf("%s not in registry", name)
		}
	}
}
