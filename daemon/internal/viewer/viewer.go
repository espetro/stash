// Package viewer embeds the built Astro viewer (apps/viewer/dist) and
// serves it plus the offline /s decode route on the daemon's loopback
// channel. F12 (plan .agents/plans/2026-08-29-local-first-f12-local-viewer-shell.md).
package viewer

import (
	"embed"
	"fmt"
	"io/fs"
	"strings"
	"time"

	"github.com/espetro/stash/daemon/internal/codec"
)

// dist holds the built viewer shell. The placeholder keeps `go build`
// green on a fresh checkout before the viewer has been built; the daemon
// build script regenerates dist and refuses stale/missing artifacts (W4).
//
//go:embed all:dist
var dist embed.FS

// FS returns the embedded dist tree rooted at dist/.
func FS() (fs.FS, error) {
	return fs.Sub(dist, "dist")
}

// Placeholder is true when the embedded dist tree is the checked-in
// placeholder rather than a real viewer build (detected via marker file).
func Placeholder() bool {
	f, err := dist.ReadFile("dist/.placeholder")
	return err == nil && strings.TrimSpace(string(f)) == "1"
}

// noindexHeader is set on every decode response (hosted-route parity).
const noindexHeader = "noindex"

// errNotLoopback is returned when Listen is asked to bind a non-loopback
// address; the daemon serves the viewer locally only.
var errNotLoopback = fmt.Errorf("viewer: refusing non-loopback listen address")

// Decode decodes a share payload string (the value of #p= / #q=, and of
// the ?p= query param). Thin wrapper so the HTTP handler and the MCP
// surface share one decode path; v6 only per the Go codec contract.
func Decode(encoded string) (*codec.DecodedPayload, error) {
	return codec.DecodeEncodedPayload(encoded)
}

// CacheControl mirrors the hosted route's buildCacheControl: responses
// carry the payload's remaining lifetime. expiry is a unix timestamp.
func CacheControl(expiry int64, now time.Time) string {
	rem := expiry - now.Unix()
	if rem < 0 {
		rem = 0
	}
	return "private, max-age=" + itoa(rem)
}

func itoa(v int64) string {
	if v == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := v < 0
	if neg {
		v = -v
	}
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
