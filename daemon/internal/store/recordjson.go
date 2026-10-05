// StashRecord ↔ Record JSON codec (plan §3.3). The extension wire shape is
// apps/extension/lib/stash-store.ts StashRecord:
//
//	{id, title?, tags: string[], note?, items: {url,title}[],
//	 shares?: ShareEvent[], kept?: boolean, createdAt, updatedAt}
//
// Known keys map to columns; unknown top-level keys are preserved verbatim
// in extra_json and merged back on output, so future optional fields
// round-trip through the daemon untouched.
package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

// knownKeys are the StashRecord fields with dedicated columns. Anything
// else in the JSON object lands in extra_json.
var knownKeys = map[string]bool{
	"id": true, "title": true, "tags": true, "note": true,
	"items": true, "shares": true, "kept": true,
	"createdAt": true, "updatedAt": true,
}

// RecordFromJSON parses one extension StashRecord into a store.Record.
// Required: id (non-empty string), items (array), createdAt/updatedAt
// (numbers). A missing kept means kept=true; a missing title means "".
// The url column is derived from the first item URL.
func RecordFromJSON(raw json.RawMessage) (Record, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return Record{}, fmt.Errorf("record: %w", err)
	}

	var r Record
	if err := json.Unmarshal(fields["id"], &r.ID); err != nil || r.ID == "" {
		return Record{}, errors.New("record: id must be a non-empty string")
	}

	items, ok := fields["items"]
	if !ok || !isJSONArray(items) {
		return Record{}, errors.New("record: items must be an array")
	}
	r.ItemsJSON = string(items)
	r.URL = firstItemURL(items)

	var createdAt, updatedAt int64
	if err := json.Unmarshal(fields["createdAt"], &createdAt); err != nil {
		return Record{}, errors.New("record: createdAt must be a number")
	}
	if err := json.Unmarshal(fields["updatedAt"], &updatedAt); err != nil {
		return Record{}, errors.New("record: updatedAt must be a number")
	}
	r.CreatedAt, r.UpdatedAt = createdAt, updatedAt

	if v, ok := fields["title"]; ok {
		if err := json.Unmarshal(v, &r.Title); err != nil {
			return Record{}, errors.New("record: title must be a string")
		}
	}
	if v, ok := fields["tags"]; ok {
		var tags []string
		if err := json.Unmarshal(v, &tags); err != nil {
			return Record{}, errors.New("record: tags must be a string array")
		}
		b, _ := json.Marshal(tags)
		r.TagsJSON = string(b)
	} else {
		r.TagsJSON = "[]"
	}
	if v, ok := fields["note"]; ok {
		var note string
		if err := json.Unmarshal(v, &note); err != nil {
			return Record{}, errors.New("record: note must be a string")
		}
		r.Note = sql.NullString{String: note, Valid: true}
	}
	if v, ok := fields["kept"]; ok {
		if err := json.Unmarshal(v, &r.Kept); err != nil {
			return Record{}, errors.New("record: kept must be a boolean")
		}
	} else {
		r.Kept = true // absent means kept
	}
	if v, ok := fields["shares"]; ok {
		if !isJSONArray(v) {
			return Record{}, errors.New("record: shares must be an array")
		}
		r.SharesJSON = string(v)
	} else {
		r.SharesJSON = "[]"
	}

	extra := map[string]json.RawMessage{}
	for k, v := range fields {
		if !knownKeys[k] {
			extra[k] = v
		}
	}
	if len(extra) > 0 {
		b, _ := json.Marshal(extra)
		r.ExtraJSON = string(b)
	} else {
		r.ExtraJSON = "{}"
	}
	return r, nil
}

// ToJSON renders the record back into the extension StashRecord shape,
// merging extra_json fields under the known keys.
func (r Record) ToJSON() json.RawMessage {
	obj := map[string]json.RawMessage{}
	if r.ExtraJSON != "" {
		var extra map[string]json.RawMessage
		if err := json.Unmarshal([]byte(r.ExtraJSON), &extra); err == nil {
			for k, v := range extra {
				if !knownKeys[k] {
					obj[k] = v
				}
			}
		}
	}
	set := func(k string, v any) {
		b, _ := json.Marshal(v)
		obj[k] = b
	}
	set("id", r.ID)
	if r.Title != "" {
		set("title", r.Title)
	}
	obj["tags"] = json.RawMessage(orDefault(r.TagsJSON, "[]"))
	if r.Note.Valid {
		set("note", r.Note.String)
	}
	obj["items"] = json.RawMessage(orDefault(r.ItemsJSON, "[]"))
	if r.SharesJSON != "" && r.SharesJSON != "[]" {
		obj["shares"] = json.RawMessage(r.SharesJSON)
	}
	set("kept", r.Kept)
	set("createdAt", r.CreatedAt)
	set("updatedAt", r.UpdatedAt)
	b, _ := json.Marshal(obj)
	return b
}

func isJSONArray(raw json.RawMessage) bool {
	var arr []json.RawMessage
	return json.Unmarshal(raw, &arr) == nil
}

func firstItemURL(items json.RawMessage) string {
	var arr []struct {
		URL string `json:"url"`
	}
	if json.Unmarshal(items, &arr) == nil && len(arr) > 0 {
		return arr[0].URL
	}
	return ""
}
