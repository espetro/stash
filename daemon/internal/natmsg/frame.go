// Package natmsg implements the native-messaging host mode: the
// newline-delimited JSON frame codec and the F1 reverse-channel envelope.
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
// Wire format (per frames.ts encodeFrame/decodeFrames): newline-delimited
// JSON. One envelope in both directions:
//
//	{ type, correlationId, payload }
//
// with frame types hello|serverCard|op|opResult|error on the F1 contract
// surface, plus daemon-local ping|pong|mcp extensions for the health loop
// and MCP routing (unknown types are rejected by TS parseFrame, so these
// must never cross to the extension channel). The Chrome native-messaging
// byte-count prefix is applied by the NM wrapper outside this codec, on
// both sides.
package natmsg

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
)

// ProtocolVersion is the version this daemon speaks.
const ProtocolVersion = "1.0.0"

// SupportedRange is the semver range of accepted peer versions.
const SupportedRange = ">=1.0.0 <2.0.0"

// MaxFrameSize caps a single newline-delimited frame.
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

// EncodeFrame writes one newline-delimited JSON envelope (frames.ts
// encodeFrame). The native-messaging byte-count prefix is applied by the NM
// wrapper outside this codec.
func EncodeFrame(w io.Writer, e *Envelope) error {
	b, err := json.Marshal(e)
	if err != nil {
		return err
	}
	if _, err := w.Write(b); err != nil {
		return err
	}
	_, err = w.Write([]byte{'\n'})
	return err
}

// Decoder reads newline-delimited envelopes from a stream. It must be
// reused across frames so buffered input is not dropped.
type Decoder struct {
	sc *bufio.Scanner
}

// NewDecoder wraps r for sequential envelope reads.
func NewDecoder(r io.Reader) *Decoder {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), MaxFrameSize)
	return &Decoder{sc: sc}
}

// Decode reads the next envelope. Returns io.EOF at end of stream.
func (d *Decoder) Decode() (*Envelope, error) {
	if !d.sc.Scan() {
		if err := d.sc.Err(); err != nil {
			return nil, err
		}
		return nil, io.EOF
	}
	line := d.sc.Bytes()
	if len(line) > MaxFrameSize {
		return nil, fmt.Errorf("frame too large: %d", len(line))
	}
	var e Envelope
	if err := json.Unmarshal(bytes.TrimSpace(line), &e); err != nil {
		return nil, err
	}
	return &e, nil
}

// DecodeFrame reads one newline-delimited envelope from r. Convenience for
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
