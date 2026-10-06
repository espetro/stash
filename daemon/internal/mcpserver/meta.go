package mcpserver

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// version is overridden via -ldflags at build time; "dev" by default.
var version = "dev"

// Version returns the daemon version.
func Version() string { return version }

// SetVersion sets the version (used by main via ldflags-injected var).
func SetVersion(v string) { version = v }

func newID() string {
	b := make([]byte, 3)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func nowMillis() int64 { return time.Now().UnixMilli() }
