// Package codec is the Go port of packages/codec (v6 share-payload
// encode/decode): msgpack + brotli + base64url (#p=) / base32 (#q=).
//
// Intentional divergences from the TS codec (do not "fix"):
//
//  1. v6-only decode. The TS decoder (packages/codec/src/decoder.ts) still
//     accepts v4/v5 for legacy links in the wild, but the repo carries zero
//     v4/v5 fixtures and the daemon treats legacy decode as browser-only.
//     This package returns ErrUnsupportedVersion ("Unsupported payload
//     version") for any v < 6 (spec §4.6.1).
//
//  2. Budget safety margin. When encoding with budget truncation, this
//     package budgets against BUDGET_CHARS - budgetMargin (64) instead of
//     BUDGET_CHARS = 8000 raw. Spike B (spec Appendix B) measured Go brotli
//     output running ~18 bytes longer than brotli-wasm at the boundary tab
//     count; a payload tuned within ~15-20 bytes of the ceiling could
//     otherwise flip by one tab between runtimes. The margin makes the
//     boundary unable to flip. Truncation is not a wire contract (spec
//     §4.6.2); the TS encoder keeps the un-margined budget.
package codec

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/andybalholm/brotli"
	"github.com/vmihailenco/msgpack/v5"
)

// Constants mirrored from packages/codec/src/constants.ts.
const (
	PayloadVersion       = 6
	ExpiryHoursDefault   = 24
	BudgetChars          = 8000
	MaxTitleChars        = 120
	CompressionThreshold = 200

	// BudgetMargin is the Go-side safety margin (spec §4.6.2): Go budgets
	// against BudgetChars - BudgetMargin so the truncation boundary can
	// never flip by one tab between the Go and TS runtimes.
	BudgetMargin = 64
)

// Decode errors. Message strings are part of the contract with the TS codec
// and the MCP surface; do not reword.
var (
	ErrInvalidFragment   = errors.New("Invalid URL fragment format")
	ErrInvalidBase64URL  = errors.New("Invalid base64url encoding")
	ErrInvalidBase32     = errors.New("Invalid base32 encoding")
	ErrUnknownPrefix     = errors.New("Unknown payload prefix")
	ErrDecompress        = errors.New("Failed to decompress payload")
	ErrInvalidStructure  = errors.New("Invalid payload structure")
	ErrUnsupportedVesion = errors.New("Unsupported payload version")
)

// b64url is RFC 4648 base64url, matching @oslojs encode/decodeBase64url (no
// padding emitted; padding tolerated on decode).
var b64url = base64URLEncoding

// b32 is RFC 4648 base32 uppercase, matching @oslojs base32 (no padding
// emitted; padding tolerated on decode).
var b32 = base32StdEncoding

// Item is one payload entry: [url, title] with an optional third element
// kind ("note" marks the url field as free text).
type Item struct {
	URL   string
	Title string
	Kind  string // "" or "note"
}

// DecodedPayload mirrors the TS DecodedPayload shape.
type DecodedPayload struct {
	Version   int64  `json:"version"`
	Expiry    int64  `json:"expiry"`
	Items     []Item `json:"items"`
	IsExpired bool   `json:"isExpired"`
	Title     string `json:"title,omitempty"`
	Tags      []string `json:"tags"`
	Note      string `json:"note,omitempty"`
}

// wireItem decodes a msgpack [url, title, kind?] tuple.
type wireItem []interface{}

// wirePayload is the v6 msgpack schema: object with string keys.
type wirePayload struct {
	V int64    `msgpack:"v"`
	E int64    `msgpack:"e"`
	I []wireItem `msgpack:"i"`
	T string   `msgpack:"t"`
	G []string `msgpack:"g"`
	N string   `msgpack:"n"`
}

func toItems(wi []wireItem) ([]Item, error) {
	items := make([]Item, 0, len(wi))
	for j, raw := range wi {
		if len(raw) < 2 {
			return nil, fmt.Errorf("item %d: want [url, title] tuple", j)
		}
		it := Item{}
		var ok bool
		if it.URL, ok = raw[0].(string); !ok {
			return nil, fmt.Errorf("item %d: url is not a string", j)
		}
		if it.Title, ok = raw[1].(string); !ok {
			return nil, fmt.Errorf("item %d: title is not a string", j)
		}
		if len(raw) > 2 {
			if it.Kind, ok = raw[2].(string); !ok {
				return nil, fmt.Errorf("item %d: kind is not a string", j)
			}
		}
		items = append(items, it)
	}
	return items, nil
}

// DecodeEncodedPayload decodes a bare encoded payload string (the value of a
// #p= or #q= fragment, without the fragment key). Transport is inferred from
// the prefix: C/R = URL adapter (base64url), D/S = QR adapter (base32).
// C/D are brotli-compressed; R/S are raw msgpack. v6 only.
func DecodeEncodedPayload(encoded string) (*DecodedPayload, error) {
	return DecodeEncodedPayloadAt(encoded, time.Now())
}

// DecodeEncodedPayloadAt is DecodeEncodedPayload with an injectable clock.
func DecodeEncodedPayloadAt(encoded string, now time.Time) (*DecodedPayload, error) {
	if len(encoded) == 0 {
		return nil, ErrInvalidFragment
	}

	prefix := encoded[0]
	body := encoded[1:]

	var raw []byte
	var err error
	switch prefix {
	case 'C', 'R':
		raw, err = decodeBase64URLIgnorePadding(body)
		if err != nil {
			return nil, ErrInvalidBase64URL
		}
	case 'D', 'S':
		raw, err = decodeBase32IgnorePadding(body)
		if err != nil {
			return nil, ErrInvalidBase32
		}
	default:
		return nil, ErrUnknownPrefix
	}

	mp := raw
	if prefix == 'C' || prefix == 'D' {
		mp, err = brotliDecompress(raw)
		if err != nil {
			return nil, ErrDecompress
		}
	}

	var wp wirePayload
	dec := msgpack.NewDecoder(bytes.NewReader(mp))
	if err := dec.Decode(&wp); err != nil {
		return nil, ErrInvalidStructure
	}

	if wp.V < PayloadVersion {
		return nil, ErrUnsupportedVesion
	}
	items, err := toItems(wp.I)
	if err != nil {
		return nil, ErrInvalidStructure
	}

	tags := wp.G
	if tags == nil {
		tags = []string{}
	}
	return &DecodedPayload{
		Version:   wp.V,
		Expiry:    wp.E,
		Items:     items,
		IsExpired: now.Unix() > wp.E,
		Title:     wp.T,
		Tags:      tags,
		Note:      wp.N,
	}, nil
}

// DecodeShareURL decodes a full "#p=..." / "#q=..." fragment.
func DecodeShareURL(fragment string) (*DecodedPayload, error) {
	switch {
	case strings.HasPrefix(fragment, "#p=") && len(fragment) > 3:
		return DecodeEncodedPayload(fragment[3:])
	case strings.HasPrefix(fragment, "#q=") && len(fragment) > 3:
		return DecodeEncodedPayload(fragment[3:])
	default:
		return nil, ErrInvalidFragment
	}
}

func brotliDecompress(data []byte) ([]byte, error) {
	return io.ReadAll(brotli.NewReader(bytes.NewReader(data)))
}

// DecodeShareURLAt is DecodeShareURL with an injectable clock.
func DecodeShareURLAt(fragment string, now time.Time) (*DecodedPayload, error) {
	switch {
	case strings.HasPrefix(fragment, "#p=") && len(fragment) > 3:
		return DecodeEncodedPayloadAt(fragment[3:], now)
	case strings.HasPrefix(fragment, "#q=") && len(fragment) > 3:
		return DecodeEncodedPayloadAt(fragment[3:], now)
	default:
		return nil, ErrInvalidFragment
	}
}
