package main

import (
	"encoding/json"
	"fmt"
	"os"

	automerge "github.com/automerge/automerge-go"
)

type item struct {
	URL   string `json:"url"`
	Title string `json:"title"`
}
type record struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Tags      []string `json:"tags"`
	Note      string   `json:"note"`
	Items     []item   `json:"items"`
	CreatedAt int64    `json:"createdAt"`
	UpdatedAt int64    `json:"updatedAt"`
}

// num coerces an automerge numeric Value to int64 regardless of whether the
// writer stored it as int64 (Automerge-JS integer default) or float64.
func num(v *automerge.Value) int64 {
	switch v.Kind() {
	case automerge.KindInt64:
		return v.Int64()
	case automerge.KindUint64:
		return int64(v.Uint64())
	case automerge.KindFloat64:
		return int64(v.Float64())
	default:
		panic(fmt.Sprintf("num: unexpected kind %v", v.Kind()))
	}
}

func must[T any](v T, err error) T {
	if err != nil {
		panic(err)
	}
	return v
}

func loadDoc(path string) *automerge.Doc {
	b := must(os.ReadFile(path))
	return must(automerge.Load(b))
}

func saveDoc(d *automerge.Doc, path string) {
	if _, err := d.Commit("go mutation"); err != nil {
		panic(err)
	}
	if err := os.WriteFile(path, d.Save(), 0o644); err != nil {
		panic(err)
	}
}

func recordsList(d *automerge.Doc) *automerge.List {
	// Resolve a concrete (objID-bound) List. A Path-based List does not
	// support Delete() in automerge-go v0.0.0-20241030 (nil objID deref).
	return must(d.RootMap().Get("records")).List()
}

func findRecord(l *automerge.List, id string) *automerge.Map {
	n := l.Len()
	for i := 0; i < n; i++ {
		v := must(l.Get(i))
		m := v.Map()
		idv := must(m.Get("id"))
		if idv.Str() == id {
			return m
		}
	}
	return nil
}

func newRecordMap(r record) map[string]any {
	its := make([]any, 0, len(r.Items))
	for _, it := range r.Items {
		its = append(its, map[string]any{"url": it.URL, "title": it.Title})
	}
	tags := make([]any, 0, len(r.Tags))
	for _, t := range r.Tags {
		tags = append(tags, t)
	}
	return map[string]any{
		"id":        r.ID,
		"title":     r.Title,
		"tags":      tags,
		"note":      r.Note,
		"items":     its,
		"createdAt": r.CreatedAt,
		"updatedAt": r.UpdatedAt,
	}
}

func materialize(d *automerge.Doc) string {
	l := recordsList(d)
	n := l.Len()
	out := make([]record, 0, n)
	for i := 0; i < n; i++ {
		m := must(l.Get(i)).Map()
		var r record
		r.ID = must(m.Get("id")).Str()
		r.Title = must(m.Get("title")).Str()
		r.Note = must(m.Get("note")).Str()
		r.CreatedAt = num(must(m.Get("createdAt")))
		r.UpdatedAt = num(must(m.Get("updatedAt")))
		tagsL := must(m.Get("tags")).List()
		r.Tags = []string{}
		for j := 0; j < tagsL.Len(); j++ {
			r.Tags = append(r.Tags, must(tagsL.Get(j)).Str())
		}
		itemsL := must(m.Get("items")).List()
		r.Items = []item{}
		for j := 0; j < itemsL.Len(); j++ {
			im := must(itemsL.Get(j)).Map()
			r.Items = append(r.Items, item{
				URL:   must(im.Get("url")).Str(),
				Title: must(im.Get("title")).Str(),
			})
		}
		out = append(out, r)
	}
	b := must(json.MarshalIndent(out, "", "  "))
	return string(b)
}

func idList(d *automerge.Doc) string {
	l := recordsList(d)
	out := ""
	for i := 0; i < l.Len(); i++ {
		if i > 0 {
			out += ","
		}
		out += must(must(l.Get(i)).Map().Get("id")).Str()
	}
	return out
}

func main() {
	switch os.Args[1] {
	case "step2":
		// Load state1, mutate rec-a title, add rec-c, serialize.
		in, out := os.Args[2], os.Args[3]
		d := loadDoc(in)
		fmt.Println("step2: loaded", in, "records:", idList(d))
		l := recordsList(d)
		ra := findRecord(l, "rec-a")
		if ra == nil {
			panic("rec-a not found")
		}
		if err := ra.Set("title", "Morning reading (edited by Go)"); err != nil {
			panic(err)
		}
		if err := ra.Set("updatedAt", int64(3000)); err != nil {
			panic(err)
		}
		if err := l.Append(newRecordMap(record{
			ID: "rec-c", Title: "Go additions", Tags: []string{"go", "spike"},
			Note: "added by go", Items: []item{{URL: "https://c.example/1", Title: "Doc C"}},
			CreatedAt: 3000, UpdatedAt: 3000,
		})); err != nil {
			panic(err)
		}
		saveDoc(d, out)
		fmt.Println("step2: wrote", out, "records:", idList(d))

	case "materialize":
		fmt.Println(materialize(loadDoc(os.Args[2])))

	case "conflict-delete":
		// Load base, delete rec-a, serialize.
		in, out := os.Args[2], os.Args[3]
		d := loadDoc(in)
		l := recordsList(d)
		n := l.Len()
		for i := 0; i < n; i++ {
			if must(must(l.Get(i)).Map().Get("id")).Str() == "rec-a" {
				if err := l.Delete(i); err != nil {
					panic(err)
				}
				break
			}
		}
		saveDoc(d, out)
		fmt.Println("conflict/delete (Go): wrote", out, "records:", idList(d))

	case "merge":
		// Load fileA, merge fileB, materialize.
		a := loadDoc(os.Args[2])
		b := loadDoc(os.Args[3])
		if _, err := a.Merge(b); err != nil {
			panic(err)
		}
		fmt.Println("merge (Go) records:", idList(a))
		fmt.Println(materialize(a))

	default:
		panic("unknown cmd " + os.Args[1])
	}
}
