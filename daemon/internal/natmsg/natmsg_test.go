package natmsg

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/espetro/stash/daemon/internal/logging"
	"github.com/espetro/stash/daemon/internal/store"
)

func TestFrameRoundTrip(t *testing.T) {
	var buf bytes.Buffer
	env := &Envelope{Type: TypeMCP, CorrelationID: "ext-abc12345", Payload: []byte(`{"x":1}`)}
	if err := EncodeFrame(&buf, env); err != nil {
		t.Fatal(err)
	}
	got, err := DecodeFrame(&buf)
	if err != nil {
		t.Fatal(err)
	}
	if got.Type != "mcp" || got.CorrelationID != "ext-abc12345" || string(got.Payload) != `{"x":1}` {
		t.Fatalf("round trip: %+v", got)
	}
}

func TestProtocolVersionRange(t *testing.T) {
	cases := map[string]bool{
		"1.0.0": true, "1.9.3": true,
		"2.0.0": false, "0.9.0": false, "garbage": false,
	}
	for v, want := range cases {
		if got := IsProtocolVersionSupported(v); got != want {
			t.Fatalf("%s: got %v want %v", v, got, want)
		}
	}
}

func TestRegistryMRUOrdering(t *testing.T) {
	reg := NewRegistry()
	reg.Touch("a", "A")
	reg.Touch("b", "B")
	reg.Touch("a", "A") // a becomes MRU front again
	peers := reg.Peers()
	if len(peers) != 2 || peers[0].ID != "a" || peers[1].ID != "b" {
		t.Fatalf("MRU order: %+v", peers)
	}
	reg.MarkStale("a")
	if !reg.Peers()[0].Stale {
		t.Fatal("stale not marked")
	}
	reg.Remove("a")
	if len(reg.Peers()) != 1 {
		t.Fatal("remove failed")
	}
}

func TestHandshakeAndMCPRouting(t *testing.T) {
	st, err := store.Open(t.TempDir() + "/s.db")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	lw, _ := logging.New(t.TempDir()+"/l", 1024, 1)

	var in, out bytes.Buffer
	EncodeFrame(&in, &Envelope{Type: TypeHello, CorrelationID: "ext-h0000001", Payload: []byte(`{"protocolVersion":"1.0.0","supportedRange":">=1.0.0 <2.0.0","extension":{"name":"Stash","version":"0.9.0"}}`)})
	EncodeFrame(&in, &Envelope{Type: TypeMCP, CorrelationID: "ext-h0000002", Payload: []byte(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)})
	// run synchronously: the reader hits EOF after the last frame and the
	// loop exits cleanly.
	if err := runHostConn(st, lw, &in, &out, NewHub()); err != nil {
		t.Fatalf("host: %v", err)
	}

	var outDec = NewDecoder(&out)
	// frame 1: serverCard
	card, err := outDec.Decode()
	if err != nil || card.Type != TypeServerCard || card.CorrelationID != "ext-h0000001" {
		t.Fatalf("handshake frame: %+v %v", card, err)
	}
	var sc ServerCard
	json.Unmarshal(card.Payload, &sc)
	if sc.Server.Name != "stash-daemon" || sc.ProtocolVersion != ProtocolVersion || sc.SupportedRange != SupportedRange {
		t.Fatalf("serverCard: %+v", sc)
	}
	// frame 2: MCP response
	respFrame, err := outDec.Decode()
	if err != nil || respFrame.Type != TypeMCP || respFrame.CorrelationID != "ext-h0000002" {
		t.Fatalf("mcp frame: %+v %v", respFrame, err)
	}
	var rpc struct {
		Result json.RawMessage `json:"result"`
	}
	if err := json.Unmarshal(respFrame.Payload, &rpc); err != nil {
		t.Fatalf("rpc payload: %v", err)
	}
	if len(rpc.Result) == 0 {
		t.Fatal("empty tools/list result")
	}
}

func TestVersionRejection(t *testing.T) {
	st, _ := store.Open(t.TempDir() + "/s.db")
	defer st.Close()
	lw, _ := logging.New(t.TempDir()+"/l", 1024, 1)
	var in, out bytes.Buffer
	EncodeFrame(&in, &Envelope{Type: TypeHello, CorrelationID: "ext-x0000001", Payload: []byte(`{"protocolVersion":"2.0.0","supportedRange":">=1.0.0 <2.0.0","extension":{"name":"Stash","version":"0.9.0"}}`)})
	if err := runHostConn(st, lw, &in, &out, NewHub()); err != nil {
		t.Fatalf("host: %v", err)
	}
	env, err := DecodeFrame(&out)
	if err != nil || env.Type != TypeError {
		t.Fatalf("expected error frame, got %+v %v", env, err)
	}
	var fe FrameError
	json.Unmarshal(env.Payload, &fe)
	if fe.Code != "unsupported_protocol_version" {
		t.Fatalf("error code: %s", fe.Code)
	}
}
