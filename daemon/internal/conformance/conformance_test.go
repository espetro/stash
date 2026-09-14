// Package conformance is the F11 Go conformance test target (plan W1).
//
// It proves the Go daemon speaks the exact byte-level (codec) and
// merge-level (CRDT) contracts the TS side tests, using the canonical
// shared fixture set and assertion matrix from F3.W3 and F6.W4.
//
// Module boundary guard: everything here is module-local. The tests
// read only packages under daemon/internal/* and the checked-in copy
// of the shared fixture set in testdata/. The spike tree lives outside the
// Go module (daemon/go.mod root is daemon/), so `go test ./...` from
// the module root can never enter it; a guard test below also asserts
// no conformance source references the forbidden tree paths.
package conformance

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/espetro/stash/daemon/internal/codec"
	"github.com/espetro/stash/daemon/internal/crdt"
)

// fixtures is the schema of the canonical shared fixture set
// (packages/shared/fixtures/payloads.json, promoted from the spike B
// corpus). Schema docs: packages/shared/fixtures/payloads.md.
type fixtures struct {
	Name       string `json:"name"`
	Fragment   string `json:"fragment"`
	ItemCount  int    `json:"itemCount"`
	Items      []struct {
		URL   string `json:"url"`
		Title string `json:"title"`
	} `json:"items"`
	Title string   `json:"title"`
	Tags  []string `json:"tags"`
	Note  string   `json:"note"`
}

// loadVectors reads the checked-in copy of the shared fixture set and
// asserts the count matches the canonical set. The copy must stay
// byte-identical with packages/shared/fixtures/payloads.json (drift is
// a failure here, see TestFixtureCopyMatchesSharedSet).
func loadVectors(t *testing.T) []fixtures {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", "payloads.json"))
	if err != nil {
		t.Fatalf("conformance fixture set missing: %v", err)
	}
	var fs []fixtures
	if err := json.Unmarshal(b, &fs); err != nil {
		t.Fatal(err)
	}
	if len(fs) != 13 {
		t.Fatalf("expected 13 canonical vectors, got %d", len(fs))
	}
	return fs
}

// clock: fixtures share expiry 1787567265 (the expired vector uses
// 1787477265). Any fixed clock between the two works.
var conformanceNow = time.Unix(1787522265, 0)

// TestConformanceCodecDecode runs every canonical vector through the Go
// decoder and asserts the semantic shape against the fixture metadata.
func TestConformanceCodecDecode(t *testing.T) {
	for _, f := range loadVectors(t) {
		t.Run(f.Name, func(t *testing.T) {
			if f.Name == "empty-items" {
				// Parity by refusal: empty fragment is rejected.
				if _, err := codec.DecodeShareURL(f.Fragment); err == nil {
					t.Fatal("empty fragment must be rejected")
				}
				return
			}
			got, err := codec.DecodeShareURLAt(f.Fragment, conformanceNow)
			if err != nil {
				t.Fatalf("decode: %v", err)
			}
			if int(got.Version) != 6 {
				t.Errorf("version = %d, want 6", got.Version)
			}
			if len(got.Items) != f.ItemCount {
				t.Fatalf("items = %d, want %d", len(got.Items), f.ItemCount)
			}
			for i, want := range f.Items {
				if got.Items[i].URL != want.URL || got.Items[i].Title != want.Title {
					t.Errorf("item %d = %q/%q, want %q/%q", i,
						got.Items[i].URL, got.Items[i].Title, want.URL, want.Title)
				}
			}
			if f.Name == "expired" && !got.IsExpired {
				t.Error("expired vector: IsExpired = false")
			}
			if f.Name != "expired" && got.IsExpired {
				t.Errorf("%s: unexpectedly expired", f.Name)
			}
			if f.Title != "" && got.Title != f.Title {
				t.Errorf("title = %q, want %q", got.Title, f.Title)
			}
			if len(f.Tags) > 0 && !reflect.DeepEqual(got.Tags, f.Tags) {
				t.Errorf("tags = %v, want %v", got.Tags, f.Tags)
			}
			if got.Tags == nil {
				t.Error("tags must default to a non-nil empty slice")
			}
		})
	}
}

// TestConformanceCodecRoundTrip re-encodes each decodable vector
// semantically: build the payload from the fixture's items and assert
// the Go codec's own decode of it reproduces the fixture. (Byte-level
// equality with brotli-wasm output is NOT a contract; see the codec
// package README.)
func TestConformanceCodecRoundTrip(t *testing.T) {
	for _, f := range loadVectors(t) {
		if f.Name == "empty-items" || f.Name == "expired" {
			continue
		}
		t.Run(f.Name, func(t *testing.T) {
			tabs := make([]codec.TabInfo, len(f.Items))
			for i, it := range f.Items {
				tabs[i] = codec.TabInfo{URL: it.URL, Title: it.Title}
			}
			res, err := codec.EncodeTabsToShareURLAt(tabs, "", codec.ExpiryHoursDefault, f.Title, f.Tags, f.Note, conformanceNow)
			if err != nil {
				t.Fatal(err)
			}
			if res.Truncated {
				t.Fatalf("canonical vector %s must fit the budget", f.Name)
			}
			var fragment string
			if idx := strings.Index(res.URL, "#"); idx >= 0 {
				fragment = res.URL[idx:]
			} else {
				fragment = "#p=" + res.URL
			}
			got, err := codec.DecodeShareURLAt(fragment, conformanceNow)
			if err != nil {
				t.Fatalf("re-decode: %v", err)
			}
			if len(got.Items) != f.ItemCount {
				t.Fatalf("re-decoded items = %d, want %d", len(got.Items), f.ItemCount)
			}
			for i, want := range f.Items {
				if got.Items[i].URL != want.URL || got.Items[i].Title != want.Title {
					t.Errorf("re-decoded item %d mismatch", i)
				}
			}
			if f.Title != "" && got.Title != f.Title {
				t.Errorf("re-decoded title = %q, want %q", got.Title, f.Title)
			}
		})
	}
}

// TestConformanceBudgetBoundary is the BUDGET_CHARS boundary case set:
// encoders budget against BUDGET_CHARS - BudgetMargin (64) so a payload
// that fits the margined budget never exceeds BUDGET_CHARS, and the
// truncation flip cannot differ between runtimes.
func TestConformanceBudgetBoundary(t *testing.T) {
	tabs := make([]codec.TabInfo, 0, 400)
	for i := 0; i < 400; i++ {
		h := fmt.Sprintf("%x", sha256.Sum256([]byte(strconv.Itoa(i))))[:48]
		tabs = append(tabs, codec.TabInfo{
			URL:   "https://example.stash.illo.fyi/path/" + h + "/?ref=conformance",
			Title: "Conformance tab " + h + " sized to force budget overflow",
		})
	}
	res, err := codec.EncodeTabsToShareURLAt(tabs, "https://stash.illo.fyi", codec.ExpiryHoursDefault, "", nil, "", conformanceNow)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Truncated {
		t.Fatal("expected truncation for 400 high-entropy tabs")
	}
	if len(res.URL) > codec.BudgetChars-codec.BudgetMargin {
		t.Errorf("URL length %d exceeds margined budget %d",
			len(res.URL), codec.BudgetChars-codec.BudgetMargin)
	}
	if res.ItemCount == 0 || res.ItemCount >= len(tabs) {
		t.Errorf("truncated item count %d out of range", res.ItemCount)
	}

	// The small canonical corpus must never truncate.
	for _, f := range loadVectors(t) {
		if f.Name == "empty-items" {
			continue
		}
		tabs := make([]codec.TabInfo, len(f.Items))
		for i, it := range f.Items {
			tabs[i] = codec.TabInfo{URL: it.URL, Title: it.Title}
		}
		res, err := codec.EncodeTabsToShareURLAt(tabs, "https://stash.illo.fyi", codec.ExpiryHoursDefault, f.Title, f.Tags, f.Note, conformanceNow)
		if err != nil {
			t.Fatalf("%s: encode: %v", f.Name, err)
		}
		if res.Truncated {
			t.Errorf("%s: canonical vector unexpectedly truncated", f.Name)
		}
	}
}

// TestConformanceFixtureCopyMatchesSharedSet guards the copy: the
// checked-in conformance vector set must stay byte-identical with the
// canonical shared fixture set (F3.W3 owns the original; never forked).
func TestConformanceFixtureCopyMatchesSharedSet(t *testing.T) {
	shared, err := os.ReadFile(filepath.Join("..", "..", "..", "packages", "shared", "fixtures", "payloads.json"))
	if err != nil {
		t.Skipf("shared fixture set not reachable (packaged module?): %v", err)
	}
	local, err := os.ReadFile(filepath.Join("testdata", "payloads.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(shared) != string(local) {
		t.Fatal("daemon/internal/conformance/testdata/payloads.json drifted from packages/shared/fixtures/payloads.json; re-copy, do not edit")
	}
}

// TestConformanceNoSpikeImports is the isolation guard: no
// conformance source may import from the spike tree (the guard itself
// spells it in pieces to avoid self-matching).
func TestConformanceNoSpikeImports(t *testing.T) {
	forbidden := "spike" + "s/"
	entries, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range entries {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(b), forbidden) {
			t.Errorf("%s references the spike tree; conformance imports must stay module-local", f)
		}
	}
}

/*
 * CRDT convergence (F6.W4 assertion matrix re-expressed as Go tests).
 */

func confRecord(id, title string, createdAt int64) crdt.Record {
	return crdt.Record{
		ID: id, Title: title, URL: "https://example.com/" + id,
		ItemsJSON: "[]", CreatedAt: createdAt, UpdatedAt: createdAt,
		Origin: "conformance", Shares: []string{},
	}
}

func confDoc(t *testing.T, rs ...crdt.Record) *crdt.Doc {
	t.Helper()
	d, err := crdt.NewDoc()
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rs {
		if err := d.PutRecord(r); err != nil {
			t.Fatal(err)
		}
	}
	if err := d.Commit("conformance seed"); err != nil {
		t.Fatal(err)
	}
	return d
}

func fork(t *testing.T, d *crdt.Doc) *crdt.Doc {
	t.Helper()
	f, err := crdt.LoadDoc(d.Save())
	if err != nil {
		t.Fatal(err)
	}
	return f
}

func listIDs(t *testing.T, d *crdt.Doc) map[string]string {
	t.Helper()
	recs, err := d.ListRecords()
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]string{}
	for _, r := range recs {
		out[r.ID] = r.Title
	}
	return out
}

// TestConformanceCRDTConcurrentEditMerge: two sides edit different
// records concurrently; after a bidirectional merge both sides converge
// with both edits intact.
func TestConformanceCRDTConcurrentEditMerge(t *testing.T) {
	base := confDoc(t, confRecord("a", "original a", 1), confRecord("b", "original b", 2))
	s1, s2 := fork(t, base), fork(t, base)

	ra, err := s1.GetRecord("a")
	if err != nil {
		t.Fatal(err)
	}
	ra.Title = "edited by s1"
	if err := s1.PutRecord(*ra); err != nil {
		t.Fatal(err)
	}
	if err := s1.Commit("s1"); err != nil {
		t.Fatal(err)
	}

	rb, err := s2.GetRecord("b")
	if err != nil {
		t.Fatal(err)
	}
	rb.Title = "edited by s2"
	if err := s2.PutRecord(*rb); err != nil {
		t.Fatal(err)
	}
	if err := s2.Commit("s2"); err != nil {
		t.Fatal(err)
	}

	if _, err := s1.Merge(s2); err != nil {
		t.Fatal(err)
	}
	if _, err := s2.Merge(s1); err != nil {
		t.Fatal(err)
	}
	if err := s1.Commit("merge1"); err != nil {
		t.Fatal(err)
	}
	if err := s2.Commit("merge2"); err != nil {
		t.Fatal(err)
	}

	m1, m2 := listIDs(t, s1), listIDs(t, s2)
	if !reflect.DeepEqual(m1, m2) {
		t.Fatalf("sides diverged: %v vs %v", m1, m2)
	}
	if m1["a"] != "edited by s1" || m1["b"] != "edited by s2" {
		t.Fatalf("concurrent edits lost: %v", m1)
	}
}

// TestConformanceCRDTDeleteVsEdit: a concurrent hard delete wins over a
// concurrent field edit of the same record; both sides converge to the
// deletion with no tombstone or duplicate.
func TestConformanceCRDTDeleteVsEdit(t *testing.T) {
	base := confDoc(t, confRecord("a", "doomed", 1), confRecord("b", "kept", 2))
	s1, s2 := fork(t, base), fork(t, base)

	if ok, err := s1.DeleteRecord("a"); err != nil || !ok {
		t.Fatalf("s1 delete: %v %v", ok, err)
	}
	if err := s1.Commit("s1 delete"); err != nil {
		t.Fatal(err)
	}

	ra, err := s2.GetRecord("a")
	if err != nil {
		t.Fatal(err)
	}
	ra.Title = "edited while deleted elsewhere"
	if err := s2.PutRecord(*ra); err != nil {
		t.Fatal(err)
	}
	if err := s2.Commit("s2 edit"); err != nil {
		t.Fatal(err)
	}

	if _, err := s1.Merge(s2); err != nil {
		t.Fatal(err)
	}
	if _, err := s2.Merge(s1); err != nil {
		t.Fatal(err)
	}
	if err := s1.Commit("m1"); err != nil {
		t.Fatal(err)
	}
	if err := s2.Commit("m2"); err != nil {
		t.Fatal(err)
	}

	m1, m2 := listIDs(t, s1), listIDs(t, s2)
	if !reflect.DeepEqual(m1, m2) {
		t.Fatalf("sides diverged: %v vs %v", m1, m2)
	}
	if _, ok := m1["a"]; ok {
		t.Fatalf("deleted record resurrected by concurrent edit: %v", m1)
	}
	if m1["b"] != "kept" {
		t.Fatalf("surviving record lost: %v", m1)
	}
}

// TestConformanceCRDTDefensiveHelpers exercises the defensive helpers
// as observable convergence outcomes: int64 field values written by
// JS-side producers must survive a save/load/merge round trip, and list
// deletion must go through the bound handle so both sides converge.
func TestConformanceCRDTDefensiveHelpers(t *testing.T) {
	base := confDoc(t, confRecord("a", "numbers", 1747000000000))
	s1, s2 := fork(t, base), fork(t, base)

	// int64 timestamps (JS Number provenance) round-trip through merge.
	if _, err := s1.Merge(s2); err != nil {
		t.Fatal(err)
	}
	recs, err := s1.ListRecords()
	if err != nil {
		t.Fatal(err)
	}
	if len(recs) != 1 || recs[0].CreatedAt != 1747000000000 {
		t.Fatalf("int64 createdAt lost in merge: %+v", recs)
	}

	// Same record deleted on both sides converges idempotently.
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
	m1, m2 := listIDs(t, s1), listIDs(t, s2)
	if len(m1) != 0 || !reflect.DeepEqual(m1, m2) {
		t.Fatalf("concurrent deletes did not converge empty: %v vs %v", m1, m2)
	}
}
