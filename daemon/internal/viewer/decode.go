package viewer

import (
	"encoding/json"

	"fmt"
	"github.com/espetro/stash/daemon/internal/codec"
	"net/http"
	"strings"
)

// Format negotiation mirrors apps/viewer/functions/s.ts and
// @stash/shared/negotiation: explicit ?format= wins, then Accept
// containment matching, then HTML fallthrough (null).
var formatAliases = map[string]string{
	"json":     "json",
	"md":       "md",
	"markdown": "md",
	"txt":      "txt",
	"plain":    "txt",
	"text":     "txt",
}

// negotiateFormat mirrors negotiateFormat from @stash/shared/negotiation.
func negotiateFormat(accept, formatParam string) (string, bool) {
	if formatParam != "" {
		f, ok := formatAliases[formatParam]
		return f, ok
	}
	lower := strings.ToLower(accept)
	switch {
	case strings.Contains(lower, "application/json"):
		return "json", true
	case strings.Contains(lower, "text/markdown"):
		return "md", true
	case strings.Contains(lower, "text/plain"):
		return "txt", true
	}
	return "", false
}

func setNoindex(h http.Header) { h.Set("X-Robots-Tag", noindexHeader) }

func writeErrorPage(w http.ResponseWriter, status int, msg string) {
	setNoindex(w.Header())
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	fmt.Fprintf(w, `<!doctype html><html><head><meta charset="utf-8"><title>Stash viewer</title></head><body style="font-family:system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem"><h1>Can&apos;t open this stash</h1><p>%s</p><p><a href="/">Open the Stash viewer</a></p></body></html>`, htmlEscape(msg))
}

func htmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&#34;", "'", "&#39;")
	return r.Replace(s)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	setNoindex(w.Header())
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// handleShare mirrors the hosted route's contract:
//   - fragment-only requests (#p=... never reaches the server) fall through
//     to the static shell, preserving the SPA decode path (W1);
//   - explicit ?format= wins, then Accept negotiation;
//   - an unknown ?format= value is a 400, not a silent HTML redirect;
//   - every decode response carries X-Robots-Tag: noindex;
//   - decode errors map to a readable error page (or JSON body when a
//     format was negotiated), never a bare 500.
//
// Self-contained payloads only: a relayed link's payload lives behind the
// fragment key (F14), and key material must never be sent to any server,
// including this loopback daemon.
func (s *Server) handleShare(w http.ResponseWriter, r *http.Request) {
	setNoindex(w.Header())
	// CORS preflight, mirroring the hosted function's OPTIONS contract.
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	rawP := r.URL.Query().Get("p")
	if rawP == "" {
		// Fragment-only (or empty) request: serve the shell; the client
		// decodes locally from the fragment with zero egress.
		s.serveShell(w, r)
		return
	}

	formatParam := r.URL.Query().Get("format")
	if formatParam != "" {
		if _, ok := formatAliases[formatParam]; !ok {
			writeJSONError(w, http.StatusBadRequest,
				"Unknown format parameter: "+formatParam+" (expected json, md, or txt)")
			return
		}
	}
	format, ok := negotiateFormat(r.Header.Get("Accept"), formatParam)
	if !ok {
		// No negotiated format: serve the interactive HTML shell.
		s.serveShell(w, r)
		return
	}

	decoded, err := Decode(rawP)
	if err != nil {
		// Decode errors are client-visible messages from the codec whose
		// strings are part of the contract; map to 400 with a readable body.
		if format == "json" {
			writeJSONError(w, http.StatusBadRequest, "Invalid payload: "+err.Error())
			return
		}
		writeErrorPage(w, http.StatusBadRequest, err.Error())
		return
	}

	cc := CacheControl(decoded.Expiry, s.now())
	w.Header().Set("Cache-Control", cc)

	switch format {
	case "json":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(jsonPayloadFrom(decoded))
	case "txt":
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		for _, it := range decoded.Items {
			if it.Kind == "note" {
				continue
			}
			fmt.Fprintln(w, it.URL)
		}
	default: // md
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		for _, it := range decoded.Items {
			title := strings.ReplaceAll(it.Title, "]", "\\]")
			title = strings.ReplaceAll(title, "[", "\\[")
			fmt.Fprintf(w, "[%s](%s)\n", title, it.URL)
		}
	}
}

// jsonItem / jsonPayload mirror the hosted route's JSON shape: lowercase
// keys and no zero-valued kind field.
type jsonItem struct {
	URL   string `json:"url"`
	Title string `json:"title"`
	Kind  string `json:"kind,omitempty"`
}

type jsonPayload struct {
	Version   int64      `json:"version"`
	Expiry    int64      `json:"expiry"`
	IsExpired bool       `json:"isExpired"`
	Title     string     `json:"title,omitempty"`
	Items     []jsonItem `json:"items"`
	Tags      []string   `json:"tags"`
	Note      string     `json:"note,omitempty"`
}

func jsonPayloadFrom(decoded *codec.DecodedPayload) jsonPayload {
	items := make([]jsonItem, 0, len(decoded.Items))
	for _, it := range decoded.Items {
		items = append(items, jsonItem{URL: it.URL, Title: it.Title, Kind: it.Kind})
	}
	tags := decoded.Tags
	if tags == nil {
		tags = []string{}
	}
	return jsonPayload{
		Version: decoded.Version, Expiry: decoded.Expiry, IsExpired: decoded.IsExpired,
		Title: decoded.Title, Items: items, Tags: tags, Note: decoded.Note,
	}
}
