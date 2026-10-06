package codec

import (
	"bytes"
	"regexp"
	"strings"
	"time"

	"github.com/andybalholm/brotli"
	"github.com/vmihailenco/msgpack/v5"
)

// TabInfo is one input tab (mirrors the TS TabInfo).
type TabInfo struct {
	URL   string `json:"url"`
	Title string `json:"title"`
	Kind  string `json:"kind,omitempty"` // "note" marks url as free text
}

// EncodingResult mirrors the TS EncodingResult.
type EncodingResult struct {
	URL       string `json:"url"`
	ItemCount int    `json:"itemCount"`
	Truncated bool   `json:"truncated"`
}

var wsRe = regexp.MustCompile(`\s+`)

// NormalizeTitle mirrors the TS normalizeTitle: trim, collapse whitespace,
// truncate to MaxTitleChars (runes).
func NormalizeTitle(title string) string {
	s := wsRe.ReplaceAllString(strings.TrimSpace(title), " ")
	r := []rune(s)
	if len(r) > MaxTitleChars {
		r = r[:MaxTitleChars]
	}
	return string(r)
}

// encPayload is the v6 wire schema (msgpack map with string keys, matching
// the object @msgpack/msgpack emits).
type encPayload struct {
	V int64      `msgpack:"v"`
	E int64      `msgpack:"e"`
	I [][]string `msgpack:"i"`
	T string     `msgpack:"t,omitempty"`
	G []string   `msgpack:"g,omitempty"`
	N string     `msgpack:"n,omitempty"`
}

func msgpackEncode(p encPayload) ([]byte, error) {
	var buf bytes.Buffer
	if err := msgpack.NewEncoder(&buf).Encode(p); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func brotliCompress(data []byte) []byte {
	var buf bytes.Buffer
	w := brotli.NewWriterLevel(&buf, brotli.BestCompression)
	_, _ = w.Write(data)
	_ = w.Close()
	return buf.Bytes()
}

// EncodePayloadToURL mirrors adapters/url-adapter.ts: msgpack, brotli only if
// it plausibly helps (CompressionThreshold), base64url, prefix C/R.
func EncodePayloadToURL(p encPayload) (string, error) {
	mp, err := msgpackEncode(p)
	if err != nil {
		return "", err
	}
	if len(mp) > CompressionThreshold {
		return "C" + encodeBase64URLNoPadding(brotliCompress(mp)), nil
	}
	return "R" + encodeBase64URLNoPadding(mp), nil
}

// EncodePayloadToQR mirrors adapters/qr-adapter.ts: always compress, base32,
// prefix D.
func EncodePayloadToQR(p encPayload) (string, error) {
	mp, err := msgpackEncode(p)
	if err != nil {
		return "", err
	}
	return "D" + encodeBase32NoPadding(brotliCompress(mp)), nil
}

// CreatePayload builds the v6 payload with expiry stamping and title
// normalization (mirrors the TS createPayload).
func CreatePayload(tabs []TabInfo, expiryHours int, title string, tags []string, note string, now time.Time) encPayload {
	items := make([][]string, 0, len(tabs))
	for _, t := range tabs {
		item := []string{t.URL, NormalizeTitle(t.Title)}
		if t.Kind == "note" {
			item = append(item, "note")
		}
		items = append(items, item)
	}
	p := encPayload{
		V: PayloadVersion,
		E: now.Unix() + int64(expiryHours)*3600,
		I: items,
	}
	if strings.TrimSpace(title) != "" {
		p.T = NormalizeTitle(title)
	}
	if len(tags) > 0 {
		p.G = tags
	}
	if strings.TrimSpace(note) != "" {
		p.N = note
	}
	return p
}

func buildShareURL(encoded, origin string) string {
	if origin == "" {
		origin = "https://stash.illo.fyi"
	}
	return origin + "/s/#p=" + encoded
}

// EncodeTabsToShareURL encodes tabs to a share URL with budget truncation.
// The budget is BudgetChars - BudgetMargin: the intentional Go-side
// divergence (spec §4.6.2, package doc) so the truncation boundary can never
// flip by one tab between the Go and TS brotli implementations.
func EncodeTabsToShareURL(tabs []TabInfo, viewerOrigin string, expiryHours int, title string, tags []string, note string) (EncodingResult, error) {
	return EncodeTabsToShareURLAt(tabs, viewerOrigin, expiryHours, title, tags, note, time.Now())
}

// EncodeTabsToShareURLAt is EncodeTabsToShareURL with an injectable clock.
func EncodeTabsToShareURLAt(tabs []TabInfo, viewerOrigin string, expiryHours int, title string, tags []string, note string, now time.Time) (EncodingResult, error) {
	if len(tabs) == 0 {
		return EncodingResult{URL: buildShareURL("", viewerOrigin)}, nil
	}

	full := CreatePayload(tabs, expiryHours, title, tags, note, now)
	enc, err := EncodePayloadToURL(full)
	if err != nil {
		return EncodingResult{}, err
	}
	fullURL := buildShareURL(enc, viewerOrigin)
	if len(fullURL) <= BudgetChars-BudgetMargin {
		return EncodingResult{URL: fullURL, ItemCount: len(tabs)}, nil
	}

	maxTabs := 0
	left, right := 0, len(tabs)
	for left <= right {
		mid := (left + right) / 2
		if mid == 0 {
			left = mid + 1
			continue
		}
		sub := CreatePayload(tabs[:mid], expiryHours, title, tags, note, now)
		s, err := EncodePayloadToURL(sub)
		if err != nil {
			return EncodingResult{}, err
		}
		if len(buildShareURL(s, viewerOrigin)) <= BudgetChars-BudgetMargin {
			maxTabs = mid
			left = mid + 1
		} else {
			right = mid - 1
		}
	}

	if maxTabs == 0 {
		return EncodingResult{URL: buildShareURL("", viewerOrigin), Truncated: true}, nil
	}
	sub := CreatePayload(tabs[:maxTabs], expiryHours, title, tags, note, now)
	s, err := EncodePayloadToURL(sub)
	if err != nil {
		return EncodingResult{}, err
	}
	return EncodingResult{URL: buildShareURL(s, viewerOrigin), ItemCount: maxTabs, Truncated: true}, nil
}
