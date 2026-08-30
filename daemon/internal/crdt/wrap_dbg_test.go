package crdt

import "testing"

func TestDbgWrap9(t *testing.T) {
	h, _ := NewDoc()
	h.PutRecord(rec("a", 1))
	h.Commit("w1")

	second, _ := NewDoc()
	second.PutRecord(rec("a", 1))
	second.PutRecord(rec("c", 3))
	second.Commit("w2")

	// variant: second.Commit BEFORE Merge didn't help in test8?? it did help.
	// Here replicate exact MergeHead flow: commit peer again then merge.
	if err := second.Commit("sync flush"); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Merge(second); err != nil {
		t.Fatal(err)
	}
	rs, _ := h.ListRecords()
	t.Logf("head: %v", rs)
}
