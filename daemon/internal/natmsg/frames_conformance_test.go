package natmsg

// Conformance tests pinning the Go frame codec to the F1 schema owned by
// apps/extension/lib/transport/frames.ts (plan:
// .agents/plans/2026-08-29-local-first-f01-transport.md, W4). The JSON
// fixtures under testdata/ mirror the expectations in frames.test.ts; if
// either side drifts on the wire shape, these fail.

import (
	"bytes"
	"encoding/binary"
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

// decodeFixture parses a fixture envelope: bare JSON in, envelope out. The
// fixtures pin the envelope schema; the NM length-prefix framing is
// symmetric Go-side code covered by TestConformanceLengthPrefixedStream.
func decodeFixture(t *testing.T, name string) *Envelope {
	t.Helper()
	raw := readFixture(t, name)
	var e Envelope
	if err := json.Unmarshal(raw, &e); err != nil {
		t.Fatalf("envelope unmarshal: %v", err)
	}
	return &e
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

// The wire format is Chrome native messaging: 4-byte little-endian length
// prefix + one JSON envelope. Stream decode handles back-to-back frames and
// rejects a truncated tail.
func TestConformanceLengthPrefixedStream(t *testing.T) {
	first := decodeFixture(t, "hello.json")
	second := decodeFixture(t, "server_card.json")

	var buf bytes.Buffer
	if err := EncodeFrame(&buf, first); err != nil {
		t.Fatal(err)
	}
	if err := EncodeFrame(&buf, second); err != nil {
		t.Fatal(err)
	}
	body := buf.Bytes()
	n := int(binary.LittleEndian.Uint32(body[:4]))
	if n+4 > len(body) {
		t.Fatal("declared length exceeds stream")
	}

	// Append a truncated tail: a partial third message must not decode.
	truncated := append(append([]byte{}, body...), 0x20, 0x00, 0x00, 0x00, '{')
	dec := NewDecoder(bytes.NewReader(truncated))
	got1, err := dec.Decode()
	if err != nil || got1.Type != TypeHello {
		t.Fatalf("frame 1: %+v %v", got1, err)
	}
	got2, err := dec.Decode()
	if err != nil || got2.Type != TypeServerCard || got2.CorrelationID != got1.CorrelationID {
		t.Fatalf("frame 2: %+v %v", got2, err)
	}
	if env, err := dec.Decode(); err == nil {
		t.Fatalf("partial tail decoded as frame: %+v", env)
	}

	// A stream cut at exactly the first message's boundary decodes cleanly.
	env, err := DecodeFrame(bytes.NewReader(body[:4+n]))
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

// F4 reverse-channel fixtures: the daemon-to-extension request and the
// extension-to-daemon replies for stash_snapshot_tabs. The extension side
// lands in F5 (plan: ...-f05-extension-sync-client.md); these pin the wire
// contract it must answer (F4 plan, "Cross-issue interfaces" / W2 note).
func TestConformanceSnapshotTabsFixtures(t *testing.T) {
	req := decodeFixture(t, "snapshot_request.json")
	if req.Type != TypeOp || req.CorrelationID != "daemon-snap0001" {
		t.Fatalf("snapshot request envelope: %+v", req)
	}
	var op OpPayload
	if err := json.Unmarshal(req.Payload, &op); err != nil {
		t.Fatal(err)
	}
	if op.Tool != "stash_snapshot_tabs" {
		t.Fatalf("request tool: %q", op.Tool)
	}

	reply := decodeFixture(t, "snapshot_reply.json")
	if reply.Type != TypeOpResult || reply.CorrelationID != req.CorrelationID {
		t.Fatalf("reply must echo the correlation id verbatim: %+v", reply)
	}
	var or OpResultPayload
	if err := json.Unmarshal(reply.Payload, &or); err != nil {
		t.Fatal(err)
	}
	var res struct {
		Items   []Tab  `json:"items"`
		Warning string `json:"warning"`
	}
	if err := json.Unmarshal(or.Result, &res); err != nil {
		t.Fatal(err)
	}
	if len(res.Items) != 1 || res.Items[0].URL != "https://github.com" || res.Items[0].Title != "GitHub" {
		t.Fatalf("reply items: %+v", res.Items)
	}

	errReply := decodeFixture(t, "snapshot_reply_error.json")
	if errReply.Type != TypeError || errReply.CorrelationID != req.CorrelationID {
		t.Fatalf("error reply envelope: %+v", errReply)
	}
	var fe FrameError
	if err := json.Unmarshal(errReply.Payload, &fe); err != nil {
		t.Fatal(err)
	}
	if fe.Code != "TABS_PERMISSION_DENIED" || fe.Message != "tabs.query failed" {
		t.Fatalf("error payload: %+v", fe)
	}
}
