// Package crdt wraps automerge-go with the defensive helpers required by
// F6/W2 (plan 2026-08-29-local-first-f06-crdt-adoption.md, spike A findings):
//
//   - num(): automerge-go's Value.Float64() panics on an int64 value and
//     Value.Int64() panics on float64; every numeric read must switch on
//     Value.Kind(). Automerge-JS writes integral JS numbers as int64, so
//     writers on both sides agree on int64 for integral fields.
//   - RecordsList(): a Path(...).List() handle supports Get/Append but not
//     Delete (nil objID deref); list mutation must go through an objID-bound
//     handle resolved via RootMap().Get("records").List().
//
// cgo is mandatory (spike A: CGO_ENABLED=0 does not compile against the
// vendored cores). automerge-go vendors prebuilt static cores selected by
// #cgo <os>,<arch> LDFLAGS, so no Rust toolchain is needed; linux/amd64
// cross builds need CC="zig cc -target x86_64-linux-gnu" and
// CGO_LDFLAGS="-lunwind" (the vendored core references _Unwind_*).
package crdt

import (
	"strings"
	"fmt"

	automerge "github.com/automerge/automerge-go"
)

// Record is the per-element field set of the `records` list in the
// per-profile Automerge document. Field names are the wire contract with the
// extension (@automerge/automerge side); do not rename.
type Record struct {
	ID        string
	Title     string
	URL       string
	ItemsJSON string
	CreatedAt int64
	UpdatedAt int64
	Origin    string
	Shares    []string // post F8 shape: present (possibly empty) from the wrap on
}

// Doc is one Automerge document for a profile: `records` as a top-level list,
// each element a map with the full Record field set.
type Doc struct {
	d *automerge.Doc
}

// NewDoc creates an empty document with the `records` list initialized.
func NewDoc() (*Doc, error) {
	d := automerge.New()
	if err := d.RootMap().Set("records", []any{}); err != nil {
		return nil, fmt.Errorf("crdt: init records list: %w", err)
	}
	if _, err := d.Commit("init"); err != nil {
		return nil, fmt.Errorf("crdt: commit init: %w", err)
	}
	return &Doc{d: d}, nil
}

// LoadDoc deserializes a document from its binary form.
func LoadDoc(blob []byte) (*Doc, error) {
	d, err := automerge.Load(blob)
	if err != nil {
		return nil, fmt.Errorf("crdt: load doc: %w", err)
	}
	return &Doc{d: d}, nil
}

// Save serializes the full document state.
func (doc *Doc) Save() []byte { return doc.d.Save() }

// Commit persists pending mutations as one change and returns its hash. A
// no-op queue (nothing mutated since the last commit) is not an error —
// empty commits are rejected by automerge.
func (doc *Doc) Commit(msg string) error {
	_, err := doc.d.Commit(msg)
	if err != nil && !strings.Contains(err.Error(), "Commit is empty") {
		return fmt.Errorf("crdt: commit: %w", err)
	}
	return nil
}

// Merge folds the peer document's changes into this document (convergence,
// not last-write-wins) and returns the applied change hashes.
func (doc *Doc) Merge(peer *Doc) ([]automerge.ChangeHash, error) {
	hashes, err := doc.d.Merge(peer.d)
	if err != nil {
		return nil, fmt.Errorf("crdt: merge: %w", err)
	}
	return hashes, nil
}

// Num coerces an automerge numeric Value to int64 across KindInt64 /
// KindUint64 / KindFloat64. Automerge-JS writes integral numbers as int64;
// calling Float64() on those panics, hence this helper (spike A).
func Num(v *automerge.Value) (int64, error) {
	switch v.Kind() {
	case automerge.KindInt64:
		return v.Int64(), nil
	case automerge.KindUint64:
		return int64(v.Uint64()), nil
	case automerge.KindFloat64:
		return int64(v.Float64()), nil
	default:
		return 0, fmt.Errorf("crdt: num: unexpected kind %v", v.Kind())
	}
}

// RecordsList resolves an objID-bound List handle for `records`. Path-based
// handles cannot Delete (spike A); all list mutation goes through this.
func (doc *Doc) RecordsList() (*automerge.List, error) {
	v, err := doc.d.RootMap().Get("records")
	if err != nil {
		return nil, fmt.Errorf("crdt: records key: %w", err)
	}
	if v == nil || v.Kind() != automerge.KindList {
		return nil, fmt.Errorf("crdt: records is not a list (kind %v)", v.Kind())
	}
	return v.List(), nil
}

// findRecord returns the index and map of the record with the given id.
func findRecord(l *automerge.List, id string) (int, *automerge.Map, error) {
	for i := 0; i < l.Len(); i++ {
		v, err := l.Get(i)
		if err != nil {
			return -1, nil, err
		}
		m := v.Map()
		idv, err := m.Get("id")
		if err != nil || idv == nil {
			continue
		}
		if idv.Str() == id {
			return i, m, nil
		}
	}
	return -1, nil, nil
}

// PutRecord inserts or updates a record by id (creates win as plain writes;
// dedup by id happens before this at the sync layer).
func (doc *Doc) PutRecord(r Record) error {
	l, err := doc.RecordsList()
	if err != nil {
		return err
	}
	m := recordToMap(r)
	_, existing, err := findRecord(l, r.ID)
	if err != nil {
		return err
	}
	if existing == nil {
		return l.Append(m)
	}
	return copyMap(m, existing)
}

// GetRecord reads one record by id; returns nil when absent.
func (doc *Doc) GetRecord(id string) (*Record, error) {
	l, err := doc.RecordsList()
	if err != nil {
		return nil, err
	}
	_, m, err := findRecord(l, id)
	if err != nil || m == nil {
		return nil, err
	}
	return mapToRecord(m)
}

// ListRecords materializes every record in doc order.
func (doc *Doc) ListRecords() ([]Record, error) {
	l, err := doc.RecordsList()
	if err != nil {
		return nil, err
	}
	out := make([]Record, 0, l.Len())
	for i := 0; i < l.Len(); i++ {
		v, err := l.Get(i)
		if err != nil {
			return nil, err
		}
		r, err := mapToRecord(v.Map())
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, nil
}

// DeleteRecord removes the record by id (hard delete, W4): the list element
// is removed, and any concurrent edits to that element are discarded on
// merge. No tombstones, no soft-delete boolean.
func (doc *Doc) DeleteRecord(id string) (bool, error) {
	l, err := doc.RecordsList()
	if err != nil {
		return false, err
	}
	i, _, err := findRecord(l, id)
	if err != nil {
		return false, err
	}
	if i < 0 {
		return false, nil
	}
	if err := l.Delete(i); err != nil {
		return false, fmt.Errorf("crdt: delete record %d: %w", i, err)
	}
	return true, nil
}

// recordToMap renders a Record as a plain map value. It deliberately does
// not use automerge.NewMap(): a detached *Map is unwritable (its doc is nil)
// and the list-put path creates and attaches its own map object.
func recordToMap(r Record) map[string]any {
	shares := make([]any, 0, len(r.Shares))
	for _, s := range r.Shares {
		shares = append(shares, s)
	}
	return map[string]any{
		"id": r.ID, "title": r.Title, "url": r.URL,
		"itemsJson": r.ItemsJSON, "createdAt": r.CreatedAt,
		"updatedAt": r.UpdatedAt, "origin": r.Origin,
		"shares": shares,
	}
}

// copyMap writes every key of the plain source map onto dst (the
// doc-attached map), used to update an existing record element in place.
func copyMap(src map[string]any, dst *automerge.Map) error {
	for k, v := range src {
		if err := dst.Set(k, v); err != nil {
			return fmt.Errorf("crdt: copy %s: %w", k, err)
		}
	}
	return nil
}

func mapToRecord(m *automerge.Map) (*Record, error) {
	get := func(k string) (*automerge.Value, error) {
		v, err := m.Get(k)
		if err != nil {
			return nil, fmt.Errorf("crdt: get %s: %w", k, err)
		}
		if v == nil {
			return nil, fmt.Errorf("crdt: missing field %q", k)
		}
		return v, nil
	}
	str := func(k string) (string, error) {
		v, err := get(k)
		if err != nil {
			return "", err
		}
		return v.Str(), nil
	}
	r := &Record{}
	var err error
	if r.ID, err = str("id"); err != nil {
		return nil, err
	}
	if r.Title, err = str("title"); err != nil {
		return nil, err
	}
	if r.URL, err = str("url"); err != nil {
		return nil, err
	}
	if r.ItemsJSON, err = str("itemsJson"); err != nil {
		return nil, err
	}
	if r.Origin, err = str("origin"); err != nil {
		return nil, err
	}
	for _, k := range []string{"createdAt", "updatedAt"} {
		v, err := get(k)
		if err != nil {
			return nil, err
		}
		n, err := Num(v)
		if err != nil {
			return nil, fmt.Errorf("crdt: %s: %w", k, err)
		}
		if k == "createdAt" {
			r.CreatedAt = n
		} else {
			r.UpdatedAt = n
		}
	}
	sv, err := get("shares")
	if err != nil {
		return nil, err
	}
	r.Shares = []string{}
	if sv.Kind() == automerge.KindList {
		sl := sv.List()
		for i := 0; i < sl.Len(); i++ {
			e, err := sl.Get(i)
			if err != nil {
				return nil, err
			}
			r.Shares = append(r.Shares, e.Str())
		}
	}
	return r, nil
}
