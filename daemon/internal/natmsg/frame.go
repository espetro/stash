// Package natmsg implements the native-messaging host mode: the NM
// length-prefixed frame codec and the F1 reverse-channel envelope.
//
// NOTE ON OWNERSHIP: the frame schema (envelope, error shape,
// protocolVersion handshake) is canonically owned by F1
// (.agents/plans/2026-08-29-local-first-f01-transport.md W4). This package
// is the reference consumer and duplicates the schema deliberately because
// F1 has not landed a shared schema module yet.
// TODO(F1 convergence): replace this copy with F1's schema module (or a
// shared fixture/contract test linking both) as soon as it exists.
package natmsg

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
)

// ProtocolVersion is the version this daemon speaks.
const ProtocolVersion = "1.0.0"

// SupportedRange is the semver range of accepted peer versions.
const SupportedRange = ">=1.0.0 <2.0.0"

// Envelope is the single F1 frame envelope: request/response with type,
// correlationId, payload; identical in both directions (spec 3.4, 4.4).
type Envelope struct {
	Type          string          `json:"type"`
	CorrelationID string          `json:"correlationId"`
	Payload       json.RawMessage `json:"payload,omitempty"`
}

// Frame types used by the handshake and health loop.
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

// Hello is the handshake payload sent by the extension on connect.
type Hello struct {
	ProtocolVersion string `json:"protocolVersion"`
	PeerID          string `json:"peerId"`
	Label           string `json:"label"`
}

// ServerCard is the greeting payload the daemon replies with.
type ServerCard struct {
	ProtocolVersion string   `json:"protocolVersion"`
	SupportedRange  string   `json:"supportedRange"`
	Name            string   `json:"name"`
	Tools           []string `json:"tools"`
}

// EncodeFrame writes the NM length-prefixed framing: 4-byte little-endian
// (native byte order on all supported hosts) length prefix followed by the
// JSON envelope.
func EncodeFrame(w io.Writer, e *Envelope) error {
	b, err := json.Marshal(e)
	if err != nil {
		return err
	}
	var prefix [4]byte
	binary.LittleEndian.PutUint32(prefix[:], uint32(len(b)))
	if _, err := w.Write(prefix[:]); err != nil {
		return err
	}
	_, err = w.Write(b)
	return err
}

// DecodeFrame reads one length-prefixed envelope.
func DecodeFrame(r io.Reader) (*Envelope, error) {
	var prefix [4]byte
	if _, err := io.ReadFull(r, prefix[:]); err != nil {
		return nil, err
	}
	n := binary.LittleEndian.Uint32(prefix[:])
	if n > 16<<20 {
		return nil, fmt.Errorf("frame too large: %d", n)
	}
	buf := make([]byte, n)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, err
	}
	var e Envelope
	if err := json.Unmarshal(buf, &e); err != nil {
		return nil, err
	}
	return &e, nil
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

// ErrorEnvelope builds an error envelope echoing the correlation id.
func ErrorEnvelope(correlationID, code, message string) *Envelope {
	b, _ := json.Marshal(FrameError{Code: code, Message: message})
	return &Envelope{Type: TypeError, CorrelationID: correlationID, Payload: b}
}
