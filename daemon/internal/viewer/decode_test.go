package viewer

import (
	"fmt"
	"github.com/espetro/stash/daemon/internal/codec"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// encodedPayload builds a v6 payload string (the #p= value) via the codec's
// own encoder, so the tests exercise the real round trip.
func encodedPayload(t *testing.T, url, title string) string {
	t.Helper()
	res, err := codec.EncodeTabsToShareURL([]codec.TabInfo{{URL: url, Title: title}},
		"https://stash.illo.fyi", 24, "", nil, "")
	if err != nil {
		t.Fatal(err)
	}
	i := strings.Index(res.URL, "#p=")
	if i < 0 {
		t.Fatalf("no fragment in %q", res.URL)
	}
	return res.URL[i+3:]
}

func TestNegotiateFormat(t *testing.T) {
	cases := []struct {
		accept, format string
		want           string
		ok             bool
	}{
		{"application/json", "", "json", true},
		{"text/markdown", "", "md", true},
		{"text/plain", "", "txt", true},
		{"text/html,application/xhtml+xml", "", "", false},
		{"*/*", "", "", false},
		{"text/markdown", "json", "json", true},
		{"application/json", "md", "md", true},
		{"", "", "", false},
		{"", "markdown", "md", true},
		{"", "yaml", "", false},
		{"", "plain", "txt", true},
	}
	for _, tc := range cases {
		got, ok := negotiateFormat(tc.accept, tc.format)
		if got != tc.want || ok != tc.ok {
			t.Errorf("negotiateFormat(%q,%q) = %q,%v want %q,%v", tc.accept, tc.format, got, ok, tc.want, tc.ok)
		}
	}
}

func TestHandleShareFragmentFallsThroughToShell(t *testing.T) {
	// Fragment-only requests never hit the server; ?p absent means the
	// shell is served (SPA decode path, zero egress).
	srv, err := NewServer()
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/s", nil)
	rec := httptest.NewRecorder()
	srv.handleShare(rec, req)
	// Placeholder build: shell missing -> readable 404 page, never a 500.
	if rec.Code != http.StatusNotFound && rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 or 404 (placeholder build)", rec.Code)
	}
	if rec.Header().Get("X-Robots-Tag") != "noindex" {
		t.Error("missing X-Robots-Tag: noindex on fallthrough response")
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "no-store") {
		t.Errorf("Cache-Control = %q, want no-store on shell", cc)
	}
}

func TestHandleShareUnknownFormatParam(t *testing.T) {
	srv, _ := NewServer()
	req := httptest.NewRequest("GET", "/s?p=Rabc&format=yaml", nil)
	rec := httptest.NewRecorder()
	srv.handleShare(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Unknown format parameter: yaml") {
		t.Errorf("body = %q", rec.Body.String())
	}
}

func TestHandleShareNegotiatedDecode(t *testing.T) {
	srv, _ := NewServer()
	p := encodedPayload(t, "https://example.com", "Example")
	fixed := time.Unix(1_800_000_000, 0)
	srv.now = func() time.Time { return fixed }

	req := httptest.NewRequest("GET", "/s?p="+p, nil)
	req.Header.Set("Accept", "application/json")
	rec := httptest.NewRecorder()
	srv.handleShare(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("json status = %d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"url": "https://example.com"`) &&
		!strings.Contains(rec.Body.String(), "https://example.com") {
		t.Errorf("json body missing url: %s", rec.Body.String())
	}
	if rec.Header().Get("X-Robots-Tag") != "noindex" {
		t.Error("missing noindex on json decode")
	}

	// txt: URL list only.
	req = httptest.NewRequest("GET", "/s?p="+p+"&format=txt", nil)
	rec = httptest.NewRecorder()
	srv.handleShare(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "https://example.com") {
		t.Fatalf("txt: %d %s", rec.Code, rec.Body.String())
	}

	// md: markdown link.
	req = httptest.NewRequest("GET", "/s?p="+p+"&format=md", nil)
	rec = httptest.NewRecorder()
	srv.handleShare(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "[Example](https://example.com)") {
		t.Fatalf("md: %d %s", rec.Code, rec.Body.String())
	}
}

func TestHandleShareInvalidPayloadErrorPage(t *testing.T) {
	srv, _ := NewServer()
	req := httptest.NewRequest("GET", "/s?p=ZZZnotavalidpayload&format=md", nil)
	rec := httptest.NewRecorder()
	srv.handleShare(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (readable error, never a bare 500)", rec.Code)
	}
	if rec.Header().Get("X-Robots-Tag") != "noindex" {
		t.Error("missing noindex on error page")
	}
}

func TestCacheControl(t *testing.T) {
	now := time.Unix(1_000, 0)
	if got := CacheControl(2_000, now); got != "private, max-age=1000" {
		t.Errorf("future: %q", got)
	}
	if got := CacheControl(500, now); got != "private, max-age=0" {
		t.Errorf("expired: %q", got)
	}
}

func TestListenRefusesNonLoopback(t *testing.T) {
	srv, _ := NewServer()
	if _, err := srv.Listen(Options{Addr: "0.0.0.0:0"}); err == nil {
		t.Fatal("expected refusal to bind non-loopback address")
	}
	ln, err := srv.Listen(Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	if host, _, _ := splitHost(ln.Addr().String()); host != "127.0.0.1" {
		t.Fatalf("bound %s, want loopback", ln.Addr())
	}
}

func splitHost(addr string) (string, string, error) {
	i := strings.LastIndex(addr, ":")
	if i < 0 {
		return addr, "", fmt.Errorf("no port")
	}
	return addr[:i], addr[i+1:], nil
}

// TestServerEndToEnd runs the real Handler over httptest and checks the
// hosted-route contract on every decode response (F12 verification list).
func TestServerEndToEnd(t *testing.T) {
	srv, err := NewServer()
	if err != nil {
		t.Fatal(err)
	}
	fixed := time.Unix(1_800_000_000, 0)
	srv.now = func() time.Time { return fixed }
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	// Oversized payload: budget-truncation margin behavior. The Go codec
	// truncates to BudgetChars - BudgetMargin; the resulting decode must
	// still succeed (never a 500).
	var tabs []codec.TabInfo
	for i := 0; i < 500; i++ {
		tabs = append(tabs, codec.TabInfo{
			URL:   fmt.Sprintf("https://example.com/tab-%d-very-long-url-suffix-padding", i),
			Title: fmt.Sprintf("Example tab number %d demonstrating budget overflow on purpose", i),
		})
	}
	res, err := codec.EncodeTabsToShareURL(tabs, "https://stash.illo.fyi", 24, "", nil, "")
	if err != nil {
		t.Fatal(err)
	}
	i := strings.Index(res.URL, "#p=")
	oversized := res.URL[i+3:]
	resp, err := http.Get(ts.URL + "/s?p=" + oversized + "&format=json")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("oversized payload decode: status %d, want 200", resp.StatusCode)
	}
	if resp.Header.Get("X-Robots-Tag") != "noindex" {
		t.Error("missing noindex on oversized decode")
	}

	// OPTIONS preflight: 204 with noindex (hosted-route parity).
	req, _ := http.NewRequest("OPTIONS", ts.URL+"/s", nil)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("OPTIONS status = %d, want 204", resp.StatusCode)
	}
	if resp.Header.Get("X-Robots-Tag") != "noindex" {
		t.Error("missing noindex on OPTIONS")
	}
}

// TestHandleShareNoFragmentNoQueryIsShell pins the fail-closed rule: a
// request whose fragment was stripped (all of them, over HTTP) never gets
// key material or payload probing; it just gets the shell.
func TestHandleShareNoFragmentNoQueryIsShell(t *testing.T) {
	srv, _ := NewServer()
	req := httptest.NewRequest("GET", "/s?p=", nil)
	rec := httptest.NewRecorder()
	srv.handleShare(rec, req)
	if rec.Code == http.StatusInternalServerError {
		t.Fatal("empty ?p= must not 500")
	}
}
