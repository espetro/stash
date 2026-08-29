package natmsg

// Conformance tests pinning the Go frame codec to the F1 schema owned by
// apps/extension/lib/transport/frames.ts (plan:
// .agents/plans/2026-08-29-local-first-f01-transport.md, W4). The JSON
// fixtures under testdata/ mirror the expectations in frames.test.ts; if
// either side drifts on the wire shape, these fail.

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func readFixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("fixture %s: %v", name, err)
	}
	return b
}

// decodeFixture runs a fixture through the codec exactly like the
// extension's decodeFrames: newline-delimited JSON bytes in, envelope out.
func decodeFixture(t *testing.T, name string) *Envelope {
	t.Helper()
	raw := readFixture(t, name)
	env, err := DecodeFrame(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("DecodeFrame: %v", err)
	}
	return env
}

func TestConformanceHandshakeFixtures(t *testing.T) {
	hello := decodeFixture(t, "hello.json")
	if hello.Type != TypeHello || hello.CorrelationID != "ext-abc12345" {
		t.Fatalf("hello envelope: %+v", hello)
	}
	var h Hello
	if err := json.Unmarshal(hello.Payload, &h); err != nil {
		t.Fatal(err)
	}
	if h.ProtocolVersion != ProtocolVersion || h.SupportedRange != SupportedRange {
		t.Fatalf("hello handshake versions: %+v", h)
	}
	if h.Extension.Name != "Stash" || h.Extension.Version != "0.9.0" {
		t.Fatalf("hello extension info: %+v", h.Extension)
	}

	card := decodeFixture(t, "server_card.json")
	if card.Type != TypeServerCard || card.CorrelationID != "ext-abc12345" {
		t.Fatalf("serverCard envelope (correlationId must echo verbatim): %+v", card)
	}
	var sc ServerCard
	if err := json.Unmarshal(card.Payload, &sc); err != nil {
		t.Fatal(err)
	}
	if sc.ProtocolVersion != ProtocolVersion || sc.SupportedRange != SupportedRange ||
		sc.Server.Name != "stashd" || sc.Server.Version != "0.1.0" {
		t.Fatalf("serverCard payload: %+v", sc)
	}
}

func TestConformanceErrorFixture(t *testing.T) {
	env := decodeFixture(t, "error.json")
	if env.Type != TypeError || env.CorrelationID != "daemon-err00001" {
		t.Fatalf("error envelope: %+v", env)
	}
	var fe FrameError
	if err := json.Unmarshal(env.Payload, &fe); err != nil {
		t.Fatal(err)
	}
	if fe.Code != "OP_FAILED" || fe.Message != "boom" || string(fe.Details) != `{"retry":true}` {
		t.Fatalf("error payload: %+v", fe)
	}
}

// The error the daemon builds must round-trip to the F1 error fixture shape.
func TestConformanceErrorEnvelopeShape(t *testing.T) {
	raw, err := json.Marshal(ErrorEnvelope("ext-z0000001", "OP_FAILED", "boom").Payload)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	var want map[string]any
	if err := json.Unmarshal(readFixture(t, "error.json"), &want); err != nil {
		t.Fatal(err)
	}
	wantPayload := want["payload"].(map[string]any)
	for _, k := range []string{"code", "message"} {
		if got[k] != wantPayload[k] {
			t.Fatalf("error field %q: got %v want %v", k, got[k], wantPayload[k])
		}
	}
	if _, ok := got["code"]; !ok {
		t.Fatal("error payload missing code")
	}
}

func TestConformanceCorrelationIDConvention(t *testing.T) {
	for _, ok := range []string{"ext-abc12345", "daemon-r0000001", "ext-T00000001"} {
		if !ValidCorrelationID(ok) {
			t.Fatalf("%q should be valid", ok)
		}
	}
	for _, bad := range []string{"abc123", "other-abc12345", "ext-", "daemon-short"} {
		if ValidCorrelationID(bad) {
			t.Fatalf("%q should be invalid", bad)
		}
	}
	for _, origin := range []string{"ext", "daemon"} {
		id, err := MintCorrelationID(origin)
		if err != nil || !ValidCorrelationID(id) || !strings.HasPrefix(id, origin+"-") {
			t.Fatalf("MintCorrelationID(%q) = %q, %v", origin, id, err)
		}
	}
	if _, err := MintCorrelationID("peer"); err == nil {
		t.Fatal("minting with unknown origin should fail")
	}
}

// Mirrors frames.test.ts "newline-delimited framing": two fixture frames
// plus a partial tail round-trip through the codec.
func TestConformanceNewlineDelimitedStream(t *testing.T) {
	raw := readFixture(t, "stream.ndjson")
	dec := NewDecoder(bytes.NewReader(raw))
	first, err := dec.Decode()
	if err != nil || first.Type != TypeHello {
		t.Fatalf("frame 1: %+v %v", first, err)
	}
	second, err := dec.Decode()
	if err != nil || second.Type != TypeServerCard || second.CorrelationID != first.CorrelationID {
		t.Fatalf("frame 2: %+v %v", second, err)
	}
	// The partial tail must NOT decode as a frame.
	if env, err := dec.Decode(); err == nil {
		t.Fatalf("partial tail decoded as frame: %+v", env)
	}

	// And the wire bytes the Go codec emits must parse back to the fixtures.
	var buf bytes.Buffer
	if err := EncodeFrame(&buf, first); err != nil {
		t.Fatal(err)
	}
	if err := EncodeFrame(&buf, second); err != nil {
		t.Fatal(err)
	}
	if !bytes.HasSuffix(buf.Bytes(), []byte("\n")) {
		t.Fatal("frames must be newline-terminated")
	}
	if !bytes.Contains(buf.Bytes(), []byte("\n{")) {
		t.Fatal("frames must be newline-delimited, not length-prefixed")
	}
	firstLine := buf.Bytes()[:bytes.IndexByte(buf.Bytes(), '\n')+1]
	env, err := DecodeFrame(bytes.NewReader(firstLine))
	if err != nil {
		t.Fatal(err)
	}
	// Compare payloads semantically: Go's json.Marshal HTML-escapes
	// `>`/`<` (e.g. ">=1.0.0 <2.0.0"), which is valid JSON either way.
	var a, b any
	if err := json.Unmarshal(first.Payload, &a); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(env.Payload, &b); err != nil {
		t.Fatal(err)
	}
	aj, _ := json.Marshal(a)
	bj, _ := json.Marshal(b)
	if env.Type != TypeHello || string(aj) != string(bj) {
		t.Fatalf("wire round-trip: %+v vs %+v", env, first)
	}
}
