package natmsg

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"sync"

	"github.com/espetro/stash/daemon/internal/logging"
	"github.com/espetro/stash/daemon/internal/mcpserver"
	"github.com/espetro/stash/daemon/internal/store"
)

// RunHost serves the native-messaging host role over r/w: newline-delimited
// F1 envelopes (see frame.go for the contract). It handles the
// hello/serverCard handshake, health ping/pong, routes MCP requests to
// the same tool registry as stdio, and serves the reverse channel
// (stash_snapshot_tabs) through a Hub (reverse.go).
func RunHost(st *store.Store, lw *logging.Writer, r io.Reader, w io.Writer) error {
	return RunHostWithHub(st, lw, r, w, NewHub())
}

// RunHostWithHub is RunHost with a caller-owned Hub, so multiple browser
// connections (tests, future multi-port hosts) share one fan-out surface.
func RunHostWithHub(st *store.Store, lw *logging.Writer, r io.Reader, w io.Writer, hub *Hub) error {
	return runHostConn(st, lw, r, w, hub)
}

type lockedWriter struct {
	mu *sync.Mutex
	w  io.Writer
}

func (lw *lockedWriter) Write(b []byte) (int, error) {
	lw.mu.Lock()
	defer lw.mu.Unlock()
	return lw.w.Write(b)
}

func runHostConn(st *store.Store, lw *logging.Writer, r io.Reader, w io.Writer, hub *Hub) error {
	srv := &mcpserver.Server{Store: st, Log: slog.Default()}
	var mu sync.Mutex
	lwrt := &lockedWriter{mu: &mu, w: w}
	write := func(env *Envelope) error { return EncodeFrame(lwrt, env) }
	ctx := context.Background()
	dec := NewDecoder(r)

	var peerID string
	defer func() {
		if peerID != "" {
			hub.Detach(peerID)
		}
	}()

	for {
		env, err := dec.Decode()
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
		switch env.Type {
		case TypeHello:
			var h Hello
			if err := json.Unmarshal(env.Payload, &h); err != nil || !IsProtocolVersionSupported(h.ProtocolVersion) {
				version := "unknown"
				if err == nil {
					version = h.ProtocolVersion
				}
				resp := ErrorEnvelope(env.CorrelationID, "unsupported_protocol_version",
					fmt.Sprintf("peer protocolVersion %q outside supported range %s", version, SupportedRange))
				mu.Lock()
				EncodeFrame(w, resp)
				mu.Unlock()
				continue
			}
			// Pairing label: the extension name from the handshake (spec
			// 5.1); the daemon-side registry is MRU-ordered on any inbound
			// frame (F4.W1).
			peerID = h.Extension.Name
			hub.Attach(peerID, peerID, write)
			card := ServerCard{
				ProtocolVersion: ProtocolVersion,
				SupportedRange:  SupportedRange,
				Server:          ServerInfo{Name: "stash-daemon", Version: mcpserver.Version()},
			}
			payload, _ := json.Marshal(card)
			mu.Lock()
			EncodeFrame(w, &Envelope{Type: TypeServerCard, CorrelationID: env.CorrelationID, Payload: payload})
			mu.Unlock()
			lw.Info("browser attached", map[string]any{"peer": h.Extension.Name, "label": h.Extension.Version})
			srv.SnapshotFn = func(ctx context.Context, browser string) (string, error) {
				return hub.SnapshotTabs(ctx, browser)
			}
		case TypePing:
			payload, _ := json.Marshal(map[string]string{"status": "ok"})
			mu.Lock()
			EncodeFrame(w, &Envelope{Type: TypePong, CorrelationID: env.CorrelationID, Payload: payload})
			mu.Unlock()
		case TypeOp, TypeOpResult:
			// Reverse channel: the browser's reply to a daemon-initiated
			// request; correlated and MRU-promoted in the Hub.
			hub.Deliver(peerID, env)
		case TypeMCP:
			// Route the browser's MCP request to the shared registry; the
			// payload is a JSON-RPC request object.
			resp := srv.Handle(ctx, env.Payload)
			if resp == nil {
				continue
			}
			payload, _ := json.Marshal(resp)
			mu.Lock()
			EncodeFrame(w, &Envelope{Type: TypeMCP, CorrelationID: env.CorrelationID, Payload: payload})
			mu.Unlock()
		default:
			mu.Lock()
			EncodeFrame(w, ErrorEnvelope(env.CorrelationID, "unknown_frame_type", "unknown type: "+env.Type))
			mu.Unlock()
		}
	}
}
