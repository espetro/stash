package codec

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strconv"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// fixturePath resolves the canonical shared fixture set
// (packages/shared/fixtures/payloads.json). The Go test target reads it
// cross-tree so there is exactly one source of truth; see
// packages/shared/fixtures/payloads.md for the schema.
func fixturePath(t *testing.T) string {
	t.Helper()
	p := filepath.Join("..", "..", "..", "packages", "shared", "fixtures", "payloads.json")
	if _, err := os.Stat(p); err != nil {
		t.Fatalf("shared fixture set not found: %v", err)
	}
	return p
}

type fixture struct {
	Name      string   `json:"name"`
	Fragment  string   `json:"fragment"`
	ItemCount int      `json:"itemCount"`
	Items     []struct {
		URL   string `json:"url"`
		Title string `json:"title"`
	} `json:"items"`
	Title string   `json:"title"`
	Tags  []string `json:"tags"`
	Note  string   `json:"note"`
}

func loadFixtures(t *testing.T) []fixture {
	t.Helper()
	b, err := os.ReadFile(fixturePath(t))
	if err != nil {
		t.Fatal(err)
	}
	var fs []fixture
	if err := json.Unmarshal(b, &fs); err != nil {
		t.Fatal(err)
	}
	if len(fs) != 13 {
		t.Fatalf("expected 13 fixtures, got %d", len(fs))
	}
	return fs
}

// fixed "now": the fixtures were generated together and share expiry
// 1787567265 (plus an intentionally earlier one for the "expired" vector).
// Any fixed clock between the two works; this one sits in between.
var fixtureExpiredExpiry int64 = 1787477265
var fixtureExpiry int64 = 1787567265
var testNow = time.Unix((fixtureExpiredExpiry+fixtureExpiry)/2, 0)

func TestDecodeConformance(t *testing.T) {
	for _, f := range loadFixtures(t) {
		t.Run(f.Name, func(t *testing.T) {
			if f.Name == "empty-items" {
				// Parity by refusal: empty fragment is rejected by design.
				_, err := DecodeShareURL(f.Fragment)
				if err != ErrInvalidFragment {
					t.Fatalf("empty fragment: want ErrInvalidFragment, got %v", err)
				}
				return
			}
			got, err := DecodeShareURLAt(f.Fragment, testNow)
			if err != nil {
				t.Fatalf("decode: %v", err)
			}
			if int(got.Version) != 6 {
				t.Errorf("version = %d, want 6", got.Version)
			}
			if len(got.Items) != f.ItemCount {
				t.Fatalf("item count = %d, want %d", len(got.Items), f.ItemCount)
			}
			for i, want := range f.Items {
				if got.Items[i].URL != want.URL || got.Items[i].Title != want.Title {
					t.Errorf("item %d = %+v, want %q/%q", i, got.Items[i], want.URL, want.Title)
				}
			}
			if f.Name == "expired" {
				if !got.IsExpired {
					t.Error("expired fixture: IsExpired = false")
				}
			} else if got.IsExpired {
				t.Errorf("%s: unexpectedly expired", f.Name)
			}
			if f.Title != "" && got.Title != f.Title {
				t.Errorf("title = %q, want %q", got.Title, f.Title)
			}
			if len(f.Tags) > 0 && !equalStrings(got.Tags, f.Tags) {
				t.Errorf("tags = %v, want %v", got.Tags, f.Tags)
			}
			if f.Note != "" && got.Note != f.Note {
				t.Errorf("note = %q, want %q", got.Note, f.Note)
			}
			if got.Tags == nil {
				t.Error("tags must default to non-nil empty slice")
			}
		})
	}
}

// TestDecodeVersionGate pins the v6-only divergence: v4/v5 payloads are
// rejected with "Unsupported payload version" even though the TS decoder
// still accepts them.
func TestDecodeVersionGate(t *testing.T) {
	for _, v := range []int64{4, 5} {
		// Hand-crafted: msgpack map {v, e, i} built via the encoder path with
		// a doctored version field.
		p := encPayload{V: 6, E: fixtureExpiry + 3600, I: [][]string{{"https://github.com", "GitHub"}}}
		p.V = v
		mp, err := msgpackEncode(p)
		if err != nil {
			t.Fatal(err)
		}
		wire := "R" + encodeBase64URLNoPadding(mp)
		_, derr := DecodeEncodedPayloadAt(wire, testNow)
		if derr != ErrUnsupportedVesion {
			t.Errorf("v%d: want ErrUnsupportedVesion, got %v", v, derr)
		}
	}
}

// TestDecodeErrorStrings pins the exact error strings shared with the TS
// decoder.
func TestDecodeErrorStrings(t *testing.T) {
	cases := []struct {
		in   string
		want error
	}{
		{"", ErrInvalidFragment},
		{"Xabc", ErrUnknownPrefix},
		{"R!!not-base64", ErrInvalidBase64URL},
		{"D!!not-base32", ErrInvalidBase32},
	}
	for _, c := range cases {
		if _, err := DecodeEncodedPayloadAt(c.in, testNow); err != c.want {
			t.Errorf("%q: want %v, got %v", c.in, c.want, err)
		}
	}
	// Raw msgpack garbage under a valid prefix -> structure error.
	if _, err := DecodeEncodedPayloadAt("R"+encodeBase64URLNoPadding([]byte{0xff, 0xff}), testNow); err != ErrInvalidStructure {
		t.Errorf("garbage msgpack: want ErrInvalidStructure, got %v", err)
	}
	// Compressed garbage under C -> decompress error.
	if _, err := DecodeEncodedPayloadAt("C"+encodeBase64URLNoPadding([]byte{0x21, 0x0, 0x0, 0x0, 0x30, 0x0}), testNow); err != ErrDecompress {
		t.Errorf("garbage brotli: want ErrDecompress, got %v", err)
	}
}

// TestEncodeDecodeRoundTrip checks bidirectional semantic round-trip: encode
// with the Go codec, decode again, and compare semantics (not bytes).
func TestEncodeDecodeRoundTrip(t *testing.T) {
	tabs := []TabInfo{
		{URL: "https://github.com", Title: "GitHub"},
		{URL: "https://example.com/日本語/テスト", Title: "日本語のページ - Unicode Test"},
		{URL: "https://example.com/path?query=value&other=123#section", Title: "URL with special chars & # ?"},
	}
	for _, transport := range []string{"url", "qr"} {
		var wire string
		var err error
		p := CreatePayload(tabs, ExpiryHoursDefault, " Title ", []string{"research"}, "a note", testNow)
		if transport == "qr" {
			wire, err = EncodePayloadToQR(p)
		} else {
			wire, err = EncodePayloadToURL(p)
		}
		if err != nil {
			t.Fatal(err)
		}
		got, err := DecodeEncodedPayloadAt(wire, testNow)
		if err != nil {
			t.Fatalf("%s: decode: %v", transport, err)
		}
		if len(got.Items) != len(tabs) {
			t.Fatalf("%s: items = %d, want %d", transport, len(got.Items), len(tabs))
		}
		for i := range tabs {
			if got.Items[i].URL != tabs[i].URL || got.Items[i].Title != tabs[i].Title {
				t.Errorf("%s: item %d mismatch: %+v", transport, i, got.Items[i])
			}
		}
		if got.Title != "Title" {
			t.Errorf("%s: title = %q, want normalized %q", transport, got.Title, "Title")
		}
		if !equalStrings(got.Tags, []string{"research"}) || got.Note != "a note" {
			t.Errorf("%s: tags/note mismatch: %+v %q", transport, got.Tags, got.Note)
		}
		if got.IsExpired {
			t.Errorf("%s: must not be expired", transport)
		}
	}
}

// TestEmptyItemsRefusal: both directions refuse an empty item list /
// fragment, matching the TS encoder/decoder parity-by-refusal case.
func TestEmptyItemsRefusal(t *testing.T) {
	if _, err := DecodeShareURL("#p="); err != ErrInvalidFragment {
		t.Errorf("#p= empty: want ErrInvalidFragment, got %v", err)
	}
	res, err := EncodeTabsToShareURLAt(nil, "", 24, "", nil, "", testNow)
	if err != nil {
		t.Fatal(err)
	}
	if res.ItemCount != 0 || res.Truncated {
		t.Errorf("empty encode: got %+v", res)
	}
}

// TestBudgetMargin documents the intentional Go-side divergence: the encoder
// must budget against BUDGET_CHARS - BudgetMargin, so a URL that fits the
// margined budget never exceeds BUDGET_CHARS itself.
func TestBudgetMargin(t *testing.T) {
	// Incompressible-ish tabs (hash suffixes) so brotli cannot collapse the
	// whole set and truncation actually engages.
	tabs := make([]TabInfo, 0, 300)
	for i := 0; i < 300; i++ {
		h := fmt.Sprintf("%x", sha256.Sum256([]byte(strconv.Itoa(i))))[:48]
		tabs = append(tabs, TabInfo{
			URL:   "https://example.stash.illo.fyi/path/" + h + "/?ref=stash",
			Title: "Example tab " + h + " demonstrating budget overflow on purpose",
		})
	}
	res, err := EncodeTabsToShareURLAt(tabs, "https://stash.illo.fyi", 24, "", nil, "", testNow)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Truncated {
		t.Fatal("expected truncation for 300 high-entropy tabs")
	}
	if len(res.URL) > BudgetChars-BudgetMargin {
		t.Errorf("truncated URL length %d exceeds margined budget %d", len(res.URL), BudgetChars-BudgetMargin)
	}
	if res.ItemCount == 0 || res.ItemCount >= len(tabs) {
		t.Errorf("item count %d out of range", res.ItemCount)
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
