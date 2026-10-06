// Package natmsg implements the native-messaging host mode: the Chrome
// native-messaging frame codec and the F1 reverse-channel envelope.
//
// CONTRACT: the frame schema (envelope, error shape, protocolVersion
// handshake) is canonically owned by the TypeScript module
// apps/extension/lib/transport/frames.ts (F1.W4, see
// .agents/plans/2026-08-29-local-first-f01-transport.md). Go cannot import
// TS, so this package mirrors that schema by hand. Drift is pinned by the
// conformance test (frames_conformance_test.go), which parses the checked-in
// JSON fixtures under testdata/ — copied from the TS contract tests in
// frames.test.ts — through the Go codec. If either side changes the wire
// shape, CI fails here.
//
// Wire format: Chrome native messaging. Each message is a 4-byte
// little-endian length prefix followed by that many bytes of UTF-8 JSON —
// one envelope in both directions:
//
//	{ type, correlationId, payload }
//
// with frame types hello|serverCard|op|opResult|error on the F1 contract
// surface, plus daemon-local ping|pong|mcp extensions for the health loop
// and MCP routing (unknown types are rejected by TS parseFrame, so these
// must never cross to the extension channel).
//
// DEVIATION: the F1 spec (§3.1) said "newline-delimited JSON over the
// host's stdio". Real Chrome NM only speaks length-prefixed messages —
// Chrome reads the first 4 bytes as the length and delivers the body as a
// deserialized JSON value, so a newline-delimited stream can never be
// parsed and was silently broken end-to-end. The envelope schema is
// unchanged; only the framing changed (spec deviation note filed).
package natmsg

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
)

// ProtocolVersion is the version this daemon speaks.
const ProtocolVersion = "1.0.0"

// SupportedRange is the semver range of accepted peer versions.
const SupportedRange = ">=1.0.0 <2.0.0"

// MaxFrameSize caps a single frame body.
const MaxFrameSize = 16 << 20

// correlationIDPattern mirrors CORRELATION_ID in frames.ts:
// `<origin>-<ulid/uuid>` with origin ext|daemon, minted by the sender and
// echoed verbatim in responses.
var correlationIDPattern = regexp.MustCompile(`^(ext|daemon)-[A-Za-z0-9]{8,}$`)

// Envelope is the single F1 frame envelope: request/response with type,
// correlationId, payload; identical in both directions (spec 3.4, 4.4).
type Envelope struct {
	Type          string          `json:"type"`
	CorrelationID string          `json:"correlationId"`
	Payload       json.RawMessage `json:"payload,omitempty"`
}

// Frame types used by the handshake and health loop. hello|serverCard|error
// are the F1 contract surface; ping|pong|mcp are daemon-local extensions.
const (
	TypeHello      = "hello"
	TypeServerCard = "serverCard"
	TypePing       = "ping"
	TypePong       = "pong"
	TypeMCP        = "mcp"
	TypeError      = "error"
)

// FrameError is the single F1 error shape: stable code, human message,
// optional details.
type FrameError struct {
	Code    string          `json:"code"`
	Message string          `json:"message"`
	Details json.RawMessage `json:"details,omitempty"`
}

// ExtensionInfo identifies the connecting extension (F1 hello payload:
// extension.name / extension.version).
type ExtensionInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// Hello is the handshake payload sent by the extension on connect. Mirrors
// HELLO_PAYLOAD in frames.ts.
type Hello struct {
	ProtocolVersion string        `json:"protocolVersion"`
	SupportedRange  string        `json:"supportedRange"`
	Extension       ExtensionInfo `json:"extension"`
}

// ServerInfo identifies the daemon (F1 serverCard payload:
// server.name / server.version).
type ServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// ServerCard is the greeting payload the daemon replies with. Mirrors
// SERVER_CARD_PAYLOAD in frames.ts (tool discovery happens over MCP, not
// the handshake).
type ServerCard struct {
	ProtocolVersion string     `json:"protocolVersion"`
	SupportedRange  string     `json:"supportedRange"`
	Server          ServerInfo `json:"server"`
}

// ValidCorrelationID reports whether id follows the F1 sender-origin
// convention (`ext-…` / `daemon-…`).
func ValidCorrelationID(id string) bool {
	return correlationIDPattern.MatchString(id)
}

// MintCorrelationID mints a correlation id for the given sender origin,
// matching frames.ts mintCorrelationId: `<origin>-<random alphanumerics>`,
// unique per sender per process lifetime.
func MintCorrelationID(origin string) (string, error) {
	if origin != "ext" && origin != "daemon" {
		return "", fmt.Errorf("invalid correlation id origin %q", origin)
	}
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	suffix := fmt.Sprintf("%x", b[:])
	return origin + "-" + suffix, nil
}

// EncodeFrame writes one envelope as a Chrome native-messaging message:
// 4-byte little-endian length prefix + JSON body.
func EncodeFrame(w io.Writer, e *Envelope) error {
	b, err := json.Marshal(e)
	if err != nil {
		return err
	}
	if len(b) > MaxFrameSize {
		return fmt.Errorf("frame too large: %d", len(b))
	}
	var hdr [4]byte
	binary.LittleEndian.PutUint32(hdr[:], uint32(len(b)))
	if _, err := w.Write(hdr[:]); err != nil {
		return err
	}
	_, err = w.Write(b)
	return err
}

// Decoder reads length-prefixed envelopes from a stream. It must be
// reused across frames.
type Decoder struct {
	r io.Reader
}

// NewDecoder wraps r for sequential envelope reads.
func NewDecoder(r io.Reader) *Decoder {
	return &Decoder{r: r}
}

// Decode reads the next envelope. Returns io.EOF on a clean end of stream
// and io.ErrUnexpectedEOF when the stream ends mid-frame.
func (d *Decoder) Decode() (*Envelope, error) {
	var hdr [4]byte
	if _, err := io.ReadFull(d.r, hdr[:]); err != nil {
		return nil, err // io.EOF (clean) or io.ErrUnexpectedEOF (truncated)
	}
	n := binary.LittleEndian.Uint32(hdr[:])
	if n == 0 || n > MaxFrameSize {
		return nil, fmt.Errorf("invalid frame length %d", n)
	}
	buf := make([]byte, n)
	if _, err := io.ReadFull(d.r, buf); err != nil {
		return nil, err
	}
	var e Envelope
	if err := json.Unmarshal(buf, &e); err != nil {
		return nil, err
	}
	return &e, nil
}

// DecodeFrame reads one length-prefixed envelope from r. Convenience for
// one-shot reads (tests, single-buffer streams); streaming callers should
// use NewDecoder.
func DecodeFrame(r io.Reader) (*Envelope, error) {
	return NewDecoder(r).Decode()
}

// IsProtocolVersionSupported reports whether v falls inside
// SupportedRange (major.minor compatibility: same major, >= 1.0).
func IsProtocolVersionSupported(v string) bool {
	var major, minor, patch int
	if _, err := fmt.Sscanf(v, "%d.%d.%d", &major, &minor, &patch); err != nil {
		return false
	}
	return major == 1
}

// ErrorEnvelope builds an error envelope echoing the correlation id, using
// the one F1 error shape ({code, message, details?}).
func ErrorEnvelope(correlationID, code, message string) *Envelope {
	b, _ := json.Marshal(FrameError{Code: code, Message: message})
	return &Envelope{Type: TypeError, CorrelationID: correlationID, Payload: b}
}
