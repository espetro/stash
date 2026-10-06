package crdt

import (
	"encoding/json"
	"fmt"
	"reflect"
	"testing"

	automerge "github.com/automerge/automerge-go"
)

func rec(id string, createdAt int64) Record {
	return Record{ID: id, Title: "t-" + id, URL: "https://x/" + id, ItemsJSON: "[]",
		CreatedAt: createdAt, UpdatedAt: createdAt, Origin: "test", Shares: []string{}}
}

func newDocWithRecords(t *testing.T, rs ...Record) *Doc {
	t.Helper()
	d, err := NewDoc()
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rs {
		if err := d.PutRecord(r); err != nil {
			t.Fatal(err)
		}
	}
	if err := d.Commit("seed"); err != nil {
		t.Fatal(err)
	}
	return d
}

// W2: Num must not panic on int64 values written by JS-side writers.
func TestNumKinds(t *testing.T) {
	d := automerge.New()
	if err := d.RootMap().Set("i", int64(42)); err != nil {
		t.Fatal(err)
	}
	if err := d.RootMap().Set("u", uint64(7)); err != nil {
		t.Fatal(err)
	}
	if err := d.RootMap().Set("f", 3.75); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"i", "u", "f"} {
		v, err := d.RootMap().Get(k)
		if err != nil {
			t.Fatal(err)
		}
		n, err := Num(v)
		if err != nil {
			t.Fatalf("%s: %v", k, err)
		}
		if want := map[string]int64{"i": 42, "u": 7, "f": 3}[k]; n != want {
			t.Fatalf("%s: got %d want %d", k, n, want)
		}
	}
	// Non-numeric must error, not panic.
	if err := d.RootMap().Set("s", "x"); err != nil {
		t.Fatal(err)
	}
	v, _ := d.RootMap().Get("s")
	if _, err := Num(v); err == nil {
		t.Fatal("expected error on non-numeric")
	}
}

// W2: delete must go through the objID-bound list handle; the doc must
// converge to the element removed.
func TestListDeleteViaBoundHandle(t *testing.T) {
	d := newDocWithRecords(t, rec("a", 1), rec("b", 2))
	ok, err := d.DeleteRecord("a")
	if err != nil || !ok {
		t.Fatalf("delete: %v %v", ok, err)
	}
	if err := d.Commit("del"); err != nil {
		t.Fatal(err)
	}
	d2, err := LoadDoc(d.Save())
	if err != nil {
		t.Fatal(err)
	}
	rs, err := d2.ListRecords()
	if err != nil {
		t.Fatal(err)
	}
	if len(rs) != 1 || rs[0].ID != "b" {
		t.Fatalf("records after delete: %+v", rs)
	}
}

// W4: concurrent merge convergence — Go creates, both sides edit/append
// concurrently, merge in both directions converges to identical state.
func TestConcurrentMergeConvergence(t *testing.T) {
	base := newDocWithRecords(t, rec("a", 1), rec("b", 2))

	// Side 1 (daemon) edits a.title, appends c.
	side1, err := LoadDoc(base.Save())
	if err != nil {
		t.Fatal(err)
	}
	r, err := side1.GetRecord("a")
	if err != nil {
		t.Fatal(err)
	}
	r.Title = "edited by side1"
	if err := side1.PutRecord(*r); err != nil {
		t.Fatal(err)
	}
	if err := side1.PutRecord(rec("c", 3)); err != nil {
		t.Fatal(err)
	}
	if err := side1.Commit("side1"); err != nil {
		t.Fatal(err)
	}

	// Side 2 (extension) edits b.title, appends d.
	side2, err := LoadDoc(base.Save())
	if err != nil {
		t.Fatal(err)
	}
	rb, err := side2.GetRecord("b")
	if err != nil {
		t.Fatal(err)
	}
	rb.Title = "edited by side2"
	if err := side2.PutRecord(*rb); err != nil {
		t.Fatal(err)
	}
	if err := side2.PutRecord(rec("d", 4)); err != nil {
		t.Fatal(err)
	}
	if err := side2.Commit("side2"); err != nil {
		t.Fatal(err)
	}

	// Merge in both directions (each side pulls the other).
	if _, err := side1.Merge(side2); err != nil {
		t.Fatal(err)
	}
	if _, err := side2.Merge(side1); err != nil {
		t.Fatal(err)
	}
	if err := side1.Commit("merge1"); err != nil {
		t.Fatal(err)
	}
	if err := side2.Commit("merge2"); err != nil {
		t.Fatal(err)
	}

	m1, err := side1.ListRecords()
	if err != nil {
		t.Fatal(err)
	}
	m2, err := side2.ListRecords()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(m1, m2) {
		t.Fatalf("sides diverged:\n%+v\n%+v", m1, m2)
	}
	if len(m1) != 4 {
		t.Fatalf("expected 4 records, got %d", len(m1))
	}
	got := map[string]string{}
	for _, r := range m1 {
		got[r.ID] = r.Title
	}
	if got["a"] != "edited by side1" || got["b"] != "edited by side2" {
		t.Fatalf("concurrent edits lost: %v", got)
	}
}

// W4: delete-vs-edit — a concurrent delete wins over a concurrent field edit
// of the same record; both sides converge, no tombstone, no duplicate.
func TestDeleteVsEditDeleteWins(t *testing.T) {
	base := newDocWithRecords(t, rec("a", 1), rec("b", 2))

	// Side 1 deletes rec-a.
	side1, err := LoadDoc(base.Save())
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := side1.DeleteRecord("a"); err != nil || !ok {
		t.Fatalf("delete: %v %v", ok, err)
	}
	if err := side1.Commit("delete a"); err != nil {
		t.Fatal(err)
	}

	// Side 2 concurrently edits rec-a.title.
	side2, err := LoadDoc(base.Save())
	if err != nil {
		t.Fatal(err)
	}
	ra, err := side2.GetRecord("a")
	if err != nil {
		t.Fatal(err)
	}
	ra.Title = "EDITED CONCURRENTLY"
	if err := side2.PutRecord(*ra); err != nil {
		t.Fatal(err)
	}
	if err := side2.Commit("edit a"); err != nil {
		t.Fatal(err)
	}

	// Each side merges the other independently.
	if _, err := side1.Merge(side2); err != nil {
		t.Fatal(err)
	}
	if err := side1.Commit("merge1"); err != nil {
		t.Fatal(err)
	}
	if _, err := side2.Merge(side1); err != nil {
		t.Fatal(err)
	}
	if err := side2.Commit("merge2"); err != nil {
		t.Fatal(err)
	}

	for name, d := range map[string]*Doc{"side1": side1, "side2": side2} {
		rs, err := d.ListRecords()
		if err != nil {
			t.Fatal(err)
		}
		if len(rs) != 1 {
			t.Fatalf("%s: expected exactly [rec-b], got %+v", name, rs)
		}
		for _, r := range rs {
			if r.ID == "a" {
				t.Fatalf("%s: deleted record resurrected (tombstone or duplicate): %+v", name, r)
			}
		}
		if rs[0].ID != "b" || rs[0].Title != "t-b" {
			t.Fatalf("%s: surviving record wrong: %+v", name, rs[0])
		}
	}
}

// W4: concurrent delete on both sides converges idempotently (no error).
func TestConcurrentDeleteBothSides(t *testing.T) {
	base := newDocWithRecords(t, rec("a", 1), rec("b", 2))
	s1, err := LoadDoc(base.Save())
	if err != nil {
		t.Fatal(err)
	}
	s2, err := LoadDoc(base.Save())
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := s1.DeleteRecord("a"); err != nil || !ok {
		t.Fatalf("s1 delete: %v %v", ok, err)
	}
	if err := s1.Commit("s1 del"); err != nil {
		t.Fatal(err)
	}
	if ok, err := s2.DeleteRecord("a"); err != nil || !ok {
		t.Fatalf("s2 delete: %v %v", ok, err)
	}
	if err := s2.Commit("s2 del"); err != nil {
		t.Fatal(err)
	}
	if _, err := s1.Merge(s2); err != nil {
		t.Fatal(err)
	}
	if _, err := s2.Merge(s1); err != nil {
		t.Fatal(err)
	}
	m1, _ := s1.ListRecords()
	m2, _ := s2.ListRecords()
	if len(m1) != 1 || m1[0].ID != "b" {
		t.Fatalf("s1 records: %+v", m1)
	}
	if !reflect.DeepEqual(m1, m2) {
		t.Fatalf("diverged: %+v vs %+v", m1, m2)
	}
}

// Materialized-view consistency: the JSON view of the merged doc is stable
// regardless of merge order (same input blobs, same view bytes).
func TestMaterializedViewDeterministic(t *testing.T) {
	base := newDocWithRecords(t, rec("a", 1), rec("b", 2))
	s1, _ := LoadDoc(base.Save())
	s2, _ := LoadDoc(base.Save())
	if err := s1.PutRecord(rec("c", 3)); err != nil {
		t.Fatal(err)
	}
	if err := s1.Commit("c"); err != nil {
		t.Fatal(err)
	}
	if ok, err := s2.DeleteRecord("a"); err != nil || !ok {
		t.Fatalf("delete: %v %v", ok, err)
	}
	if err := s2.Commit("del"); err != nil {
		t.Fatal(err)
	}
	// Merge order A: s1 pulls s2 first.
	if _, err := s1.Merge(s2); err != nil {
		t.Fatal(err)
	}
	if err := s1.Commit("m"); err != nil {
		t.Fatal(err)
	}
	// Merge order B: a fresh doc pulls s2 then s1.
	s3, _ := LoadDoc(base.Save())
	if _, err := s3.Merge(s2); err != nil {
		t.Fatal(err)
	}
	if _, err := s3.Merge(s1); err != nil {
		t.Fatal(err)
	}
	if err := s3.Commit("m3"); err != nil {
		t.Fatal(err)
	}
	v1, _ := s1.ListRecords()
	v3, _ := s3.ListRecords()
	b1, _ := json.Marshal(v1)
	b3, _ := json.Marshal(v3)
	if string(b1) != string(b3) {
		t.Fatalf("view depends on merge order:\n%s\n%s", b1, b3)
	}
	if len(v1) != 2 {
		t.Fatalf("expected 2 surviving records, got %+v", v1)
	}
}

// Sequencing contract with F8: shares[] is part of the wrapped shape from
// day one, and appending to it later is a plain field write (never a re-wrap).
func TestSharesFieldPlainWrite(t *testing.T) {
	d := newDocWithRecords(t, rec("a", 1))
	r, err := d.GetRecord("a")
	if err != nil {
		t.Fatal(err)
	}
	if r.Shares == nil || len(r.Shares) != 0 {
		t.Fatalf("shares must be present (possibly empty), got %#v", r.Shares)
	}
	r.Shares = []string{"peer-9"}
	if err := d.PutRecord(*r); err != nil {
		t.Fatal(err)
	}
	if err := d.Commit("share"); err != nil {
		t.Fatal(err)
	}
	d2, err := LoadDoc(d.Save())
	if err != nil {
		t.Fatal(err)
	}
	got, err := d2.GetRecord("a")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Shares, []string{"peer-9"}) {
		t.Fatalf("shares lost: %+v", got)
	}
}

func ExampleDoc_mergeFlow() {
	base, _ := NewDoc()
	_ = base.PutRecord(rec("a", 1))
	_ = base.Commit("seed")

	peer, _ := LoadDoc(base.Save())
	_ = peer.PutRecord(rec("b", 2))
	_ = peer.Commit("peer add")

	if _, err := base.Merge(peer); err != nil {
		fmt.Println("merge:", err)
		return
	}
	rs, _ := base.ListRecords()
	fmt.Println(len(rs), rs[0].ID, rs[1].ID)
	// Output: 2 a b
}
