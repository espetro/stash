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

// RunHost serves the native-messaging host role over r/w: length-prefixed
// F1 envelopes. It handles the hello/serverCard handshake, health
// ping/pong, and routes MCP requests to the same tool registry as stdio.
func RunHost(st *store.Store, lw *logging.Writer, r io.Reader, w io.Writer) error {
	return runHostConn(st, lw, r, w, NewRegistry())
}

func runHostConn(st *store.Store, lw *logging.Writer, r io.Reader, w io.Writer, reg *Registry) error {
	srv := &mcpserver.Server{Store: st, Log: slog.Default()}
	var mu sync.Mutex
	ctx := context.Background()

	for {
		env, err := DecodeFrame(r)
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
			reg.Touch(h.PeerID, h.Label)
			card := ServerCard{
				ProtocolVersion: ProtocolVersion,
				SupportedRange:  SupportedRange,
				Name:            "stash-daemon",
				Tools:           mcpserver.ToolNames(),
			}
			payload, _ := json.Marshal(card)
			mu.Lock()
			EncodeFrame(w, &Envelope{Type: TypeServerCard, CorrelationID: env.CorrelationID, Payload: payload})
			mu.Unlock()
			lw.Info("browser attached", map[string]any{"peer": h.PeerID, "label": h.Label})
		case TypePing:
			payload, _ := json.Marshal(map[string]string{"status": "ok"})
			mu.Lock()
			EncodeFrame(w, &Envelope{Type: TypePong, CorrelationID: env.CorrelationID, Payload: payload})
			mu.Unlock()
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
