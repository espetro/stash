// Throwaway spike: a minimal Go re-implementation of packages/codec's v6 wire
// format, used only to prove bidirectional semantic round-trip with the TS
// codec. Not shipped. See ../RESULTS.md.
package main

import (
	"bytes"
	"encoding/base32"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/andybalholm/brotli"
	"github.com/vmihailenco/msgpack/v5"
)

// --- constants mirrored from packages/codec/src/constants.ts ---
const (
	payloadVersion       = 6
	expiryHoursDefault   = 24
	budgetCharsDefault   = 8000
	maxTitleChars        = 120
	compressionThreshold = 200
)

// b64url = RFC4648 base64url, no padding (matches @oslojs encodeBase64urlNoPadding)
var b64url = base64.URLEncoding.WithPadding(base64.NoPadding)

// b32 = RFC4648 base32 uppercase, no padding (matches @oslojs encodeBase32UpperCaseNoPadding)
var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

var wsRe = regexp.MustCompile(`\s+`)

// sharePayload serialises to a msgpack map with string keys, matching the
// object @msgpack/msgpack encodes on the TS side.
type sharePayload struct {
	V int        `msgpack:"v"`
	E int64      `msgpack:"e"`
	I [][]string `msgpack:"i"`
	T string     `msgpack:"t,omitempty"`
	G []string   `msgpack:"g,omitempty"`
	N string     `msgpack:"n,omitempty"`
}

type tabInfo struct {
	URL   string `json:"url"`
	Title string `json:"title"`
	Kind  string `json:"kind,omitempty"`
}

type decodedOut struct {
	Version int        `json:"version"`
	Expiry  int64      `json:"expiry"`
	Items   [][]string `json:"items"`
	Title   string     `json:"title,omitempty"`
	Tags    []string   `json:"tags"`
	Note    string     `json:"note,omitempty"`
}

func normalizeTitle(s string) string {
	s = strings.TrimSpace(s)
	s = wsRe.ReplaceAllString(s, " ")
	r := []rune(s)
	if len(r) > maxTitleChars {
		r = r[:maxTitleChars]
	}
	return string(r)
}

func createPayload(tabs []tabInfo, expiryHours int, title string, tags []string, note string) sharePayload {
	now := time.Now().Unix()
	p := sharePayload{
		V: payloadVersion,
		E: now + int64(expiryHours)*3600,
		I: make([][]string, 0, len(tabs)),
	}
	for _, t := range tabs {
		item := []string{t.URL, normalizeTitle(t.Title)}
		if t.Kind == "note" {
			item = append(item, "note")
		}
		p.I = append(p.I, item)
	}
	if strings.TrimSpace(title) != "" {
		p.T = normalizeTitle(title)
	}
	if len(tags) > 0 {
		p.G = tags
	}
	if strings.TrimSpace(note) != "" {
		p.N = note
	}
	return p
}

func msgpackEncode(p sharePayload) ([]byte, error) {
	var buf bytes.Buffer
	enc := msgpack.NewEncoder(&buf)
	enc.SetCustomStructTag("msgpack")
	// Encode structs as maps with string keys (not arrays).
	enc.UseArrayEncodedStructs(false)
	if err := enc.Encode(p); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func brotliCompress(data []byte) []byte {
	var buf bytes.Buffer
	w := brotli.NewWriterLevel(&buf, brotli.BestCompression) // quality 11
	_, _ = w.Write(data)
	_ = w.Close()
	return buf.Bytes()
}

func brotliDecompress(data []byte) ([]byte, error) {
	return io.ReadAll(brotli.NewReader(bytes.NewReader(data)))
}

// encodePayloadToURL mirrors adapters/url-adapter.ts
func encodePayloadToURL(p sharePayload) (string, error) {
	mp, err := msgpackEncode(p)
	if err != nil {
		return "", err
	}
	if len(mp) > compressionThreshold {
		return "C" + b64url.EncodeToString(brotliCompress(mp)), nil
	}
	return "R" + b64url.EncodeToString(mp), nil
}

// encodePayloadToQr mirrors adapters/qr-adapter.ts (always compresses)
func encodePayloadToQr(p sharePayload) (string, error) {
	mp, err := msgpackEncode(p)
	if err != nil {
		return "", err
	}
	return "D" + b32.EncodeToString(brotliCompress(mp)), nil
}

// decodeEncodedPayload mirrors decoder.ts
func decodeEncodedPayload(encoded string) (decodedOut, error) {
	var out decodedOut
	if len(encoded) == 0 {
		return out, fmt.Errorf("Invalid URL fragment format")
	}
	prefix := encoded[0]
	body := encoded[1:]

	var raw []byte
	var err error
	switch prefix {
	case 'C', 'R':
		raw, err = b64url.DecodeString(body)
		if err != nil {
			return out, fmt.Errorf("Invalid base64url encoding: %w", err)
		}
	case 'D', 'S':
		raw, err = b32.DecodeString(body)
		if err != nil {
			return out, fmt.Errorf("Invalid base32 encoding: %w", err)
		}
	default:
		return out, fmt.Errorf("Unknown payload prefix")
	}

	var mp []byte
	if prefix == 'C' || prefix == 'D' {
		mp, err = brotliDecompress(raw)
		if err != nil {
			return out, fmt.Errorf("Failed to decompress payload: %w", err)
		}
	} else {
		mp = raw
	}

	var p sharePayload
	dec := msgpack.NewDecoder(bytes.NewReader(mp))
	dec.SetCustomStructTag("msgpack")
	if err := dec.Decode(&p); err != nil {
		return out, fmt.Errorf("Invalid payload structure: %w", err)
	}
	if p.V != 4 && p.V != 5 && p.V != 6 {
		return out, fmt.Errorf("Unsupported payload version: %d", p.V)
	}
	out = decodedOut{
		Version: p.V,
		Expiry:  p.E,
		Items:   p.I,
		Title:   p.T,
		Tags:    p.G,
		Note:    p.N,
	}
	if out.Tags == nil {
		out.Tags = []string{}
	}
	if out.Items == nil {
		out.Items = [][]string{}
	}
	return out, nil
}

func readStdin() []byte {
	b, _ := io.ReadAll(os.Stdin)
	return b
}

type encodeReq struct {
	Tabs        []tabInfo `json:"tabs"`
	ExpiryHours *int      `json:"expiryHours"`
	Title       string    `json:"title"`
	Tags        []string  `json:"tags"`
	Note        string    `json:"note"`
	Transport   string    `json:"transport"` // "url" (default) | "qr"
}

type budgetReq struct {
	Tabs         []tabInfo `json:"tabs"`
	BudgetChars  *int      `json:"budgetChars"`
	ViewerOrigin string    `json:"viewerOrigin"`
	ExpiryHours  *int      `json:"expiryHours"`
}

func buildShareURL(encoded, origin string) string {
	if origin == "" {
		origin = "https://stash.illo.fyi"
	}
	return origin + "/s/#p=" + encoded
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: codec-conformance <decode|encode|budget>")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "decode":
		in := strings.TrimSpace(string(readStdin()))
		in = strings.TrimPrefix(in, "#p=")
		in = strings.TrimPrefix(in, "#q=")
		out, err := decodeEncodedPayload(in)
		if err != nil {
			fmt.Fprintln(os.Stderr, "decode error:", err)
			os.Exit(1)
		}
		_ = json.NewEncoder(os.Stdout).Encode(out)

	case "encode":
		var req encodeReq
		if err := json.Unmarshal(readStdin(), &req); err != nil {
			fmt.Fprintln(os.Stderr, "bad request:", err)
			os.Exit(2)
		}
		eh := expiryHoursDefault
		if req.ExpiryHours != nil {
			eh = *req.ExpiryHours
		}
		p := createPayload(req.Tabs, eh, req.Title, req.Tags, req.Note)
		var s string
		var err error
		if req.Transport == "qr" {
			s, err = encodePayloadToQr(p)
		} else {
			s, err = encodePayloadToURL(p)
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, "encode error:", err)
			os.Exit(1)
		}
		fmt.Print(s)

	case "budget":
		var req budgetReq
		if err := json.Unmarshal(readStdin(), &req); err != nil {
			fmt.Fprintln(os.Stderr, "bad request:", err)
			os.Exit(2)
		}
		budget := budgetCharsDefault
		if req.BudgetChars != nil {
			budget = *req.BudgetChars
		}
		eh := expiryHoursDefault
		if req.ExpiryHours != nil {
			eh = *req.ExpiryHours
		}
		enc := func(tabs []tabInfo) (int, error) {
			p := createPayload(tabs, eh, "", nil, "")
			s, err := encodePayloadToURL(p)
			if err != nil {
				return 0, err
			}
			return len(buildShareURL(s, req.ViewerOrigin)), nil
		}
		// mirror _findMaxTabsWithinBudget
		fullLen, err := enc(req.Tabs)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if fullLen <= budget {
			fmt.Print(len(req.Tabs))
			return
		}
		left, right, result := 0, len(req.Tabs), 0
		for left <= right {
			mid := (left + right) / 2
			if mid == 0 {
				left = mid + 1
				continue
			}
			l, err := enc(req.Tabs[:mid])
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			if l <= budget {
				result = mid
				left = mid + 1
			} else {
				right = mid - 1
			}
		}
		fmt.Print(result)

	default:
		fmt.Fprintln(os.Stderr, "unknown subcommand:", os.Args[1])
		os.Exit(2)
	}
}
