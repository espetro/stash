package store

import (
	"encoding/json"
	"testing"
)

func TestRecordFromJSON(t *testing.T) {
	raw := json.RawMessage(`{
		"id": "r1",
		"title": "My stash",
		"tags": ["a", "b"],
		"note": "a note",
		"items": [{"url": "https://x", "title": "X"}, {"url": "https://y"}],
		"shares": [{"at": 1, "url": "https://s"}],
		"kept": false,
		"createdAt": 100,
		"updatedAt": 200,
		"customField": {"nested": [1,2]},
		"weird": "preserved"
	}`)
	r, err := RecordFromJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if r.ID != "r1" || r.Title != "My stash" || r.URL != "https://x" {
		t.Fatalf("record = %+v", r)
	}
	if r.Kept {
		t.Fatal("kept should be false")
	}
	if !r.Note.Valid || r.Note.String != "a note" {
		t.Fatal("note not parsed")
	}
	var extras map[string]any
	if err := json.Unmarshal([]byte(r.ExtraJSON), &extras); err != nil {
		t.Fatal(err)
	}
	if _, ok := extras["customField"]; !ok {
		t.Fatal("unknown field customField not preserved")
	}
	if extras["weird"] != "preserved" {
		t.Fatal("unknown field weird not preserved")
	}

	out := r.ToJSON()
	var back map[string]any
	if err := json.Unmarshal([]byte(out), &back); err != nil {
		t.Fatal(err)
	}
	// unknown fields round-trip back to top level
	if _, ok := back["customField"]; !ok {
		t.Fatal("extra field lost on ToJSON")
	}
	if back["kept"] != false || back["note"] != "a note" || back["updatedAt"].(float64) != 200 {
		t.Fatalf("ToJSON = %s", out)
	}
	var items []map[string]any
	if err := json.Unmarshal([]byte(r.ItemsJSON), &items); err != nil || len(items) != 2 {
		t.Fatal("items not preserved")
	}
}

func TestRecordFromJSONDefaults(t *testing.T) {
	raw := json.RawMessage(`{"id":"m","items":[],"createdAt":1,"updatedAt":2}`)
	r, err := RecordFromJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !r.Kept {
		t.Fatal("missing kept must default to true")
	}
	if r.TagsJSON != "[]" || r.SharesJSON != "[]" {
		t.Fatal("tags/shares defaults")
	}
	var m map[string]any
	json.Unmarshal(r.ToJSON(), &m)
	if m["kept"] != true {
		t.Fatal("kept not emitted")
	}
}

func TestRecordFromJSONInvalid(t *testing.T) {
	for name, raw := range map[string]string{
		"empty id":    `{"id":"","items":[],"createdAt":1,"updatedAt":1}`,
		"missing id":  `{"items":[],"createdAt":1,"updatedAt":1}`,
		"bad items":   `{"id":"x","items":"nope","createdAt":1,"updatedAt":1}`,
		"bad created": `{"id":"x","items":[],"createdAt":"x","updatedAt":1}`,
		"bad updated": `{"id":"x","items":[],"createdAt":1,"updatedAt":false}`,
		"bad tags":    `{"id":"x","items":[],"createdAt":1,"updatedAt":1,"tags":"x"}`,
		"bad json":    `{oops`,
	} {
		if _, err := RecordFromJSON(json.RawMessage(raw)); err == nil {
			t.Fatalf("%s: want error", name)
		}
	}
}
