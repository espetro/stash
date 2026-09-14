// Package config resolves the daemon config directory and reads stash.toml.
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/BurntSushi/toml"
)

// Dir returns the resolved config directory. Precedence:
//  1. explicit --config-dir override (override != "")
//  2. OS convention
//
// The directory is created (0700) on return if missing.
func Dir(override string) (string, error) {
	var dir string
	if override != "" {
		dir = override
	} else {
		switch runtime.GOOS {
		case "darwin":
			home, err := os.UserHomeDir()
			if err != nil {
				return "", fmt.Errorf("resolve home: %w", err)
			}
			dir = filepath.Join(home, "Library", "Application Support", "stash")
		case "windows":
			appdata := os.Getenv("APPDATA")
			if appdata == "" {
				return "", fmt.Errorf("%%APPDATA%% is not set")
			}
			dir = filepath.Join(appdata, "stash")
		default: // linux and other unix
			if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
				dir = filepath.Join(xdg, "stash")
			} else {
				home, err := os.UserHomeDir()
				if err != nil {
					return "", fmt.Errorf("resolve home: %w", err)
				}
				dir = filepath.Join(home, ".config", "stash")
			}
		}
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("create config dir %s: %w", dir, err)
	}
	return dir, nil
}

// Paths groups well-known files inside the config dir.
type Paths struct {
	Dir      string
	DB       string
	LogsDir  string
	LogFile  string
	PidFile  string
	CardFile string
	TOMLFile string
}

// Layout returns the file layout for a config dir.
func Layout(dir string) Paths {
	return Paths{
		Dir:      dir,
		DB:       filepath.Join(dir, "stash.db"),
		LogsDir:  filepath.Join(dir, "logs"),
		LogFile:  filepath.Join(dir, "logs", "stash-daemon.log"),
		PidFile:  filepath.Join(dir, "daemon.pid"),
		CardFile: filepath.Join(dir, "mcp-server-card.json"),
		TOMLFile: filepath.Join(dir, "stash.toml"),
	}
}

// TOML mirrors the daemon config contract. The four relay keys are defined
// by F7 but parsed and stored from this milestone on (unused in F2).
// F12 adds a single serve-disable flag under that contract: when
// viewerDisabled is true the daemon does not start the loopback viewer
// server. No new key namespace is introduced.
type TOML struct {
	DefaultRelayTtl       string `toml:"defaultRelayTtl"`
	RelayEndpoint         string `toml:"relayEndpoint"`
	MirrorEndpoint        string `toml:"mirrorEndpoint"`
	DefaultShareTransport string `toml:"defaultShareTransport"`
	ViewerDisabled        bool   `toml:"viewerDisabled"`
}

// ReadTOML reads <config>/stash.toml. A missing file yields the zero TOML
// and no error; a malformed file is an error.
func ReadTOML(path string) (TOML, error) {
	var t TOML
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return t, nil
	}
	if err != nil {
		return t, fmt.Errorf("read %s: %w", path, err)
	}
	if err := toml.Unmarshal(b, &t); err != nil {
		return t, fmt.Errorf("parse %s: %w", path, err)
	}
	return t, nil
}

// Built-in defaults for the four relay keys (F7 contract, §8.2).
const (
	DefaultRelayTtl       = "7d"
	DefaultRelayEndpoint  = "https://stash.illo.fyi"
	DefaultShareTransport = "relay"
)

// RelaySettings carries the four resolved relay keys.
type RelaySettings struct {
	DefaultRelayTtl       string
	RelayEndpoint         string
	MirrorEndpoint        string // may be empty; consumed by F13
	DefaultShareTransport string
}

// RelaySettings returns the TOML-provided relay values, without defaults.
func (t TOML) RelaySettings() RelaySettings {
	return RelaySettings{
		DefaultRelayTtl:       t.DefaultRelayTtl,
		RelayEndpoint:         t.RelayEndpoint,
		MirrorEndpoint:        t.MirrorEndpoint,
		DefaultShareTransport: t.DefaultShareTransport,
	}
}

// ValidRelayTtl reports whether v is one of the relay TTL values accepted
// by the relay's write paths (1d, 7d, 14d, 30d).
func ValidRelayTtl(v string) bool {
	switch v {
	case "1d", "7d", "14d", "30d":
		return true
	}
	return false
}

// ResolveRelay resolves the four relay keys with precedence:
//  1. TOML value (stash.toml in the config dir)
//  2. SQLite config table (persisted earlier; lookup returns "" if absent)
//  3. built-in default
//
// lookup is a store.GetConfig-style accessor, injected to avoid a
// dependency on the store package. A nonzero error from lookup aborts.
// An invalid defaultRelayTtl from either source is an error.
func ResolveRelay(t TOML, lookup func(key string) (string, error)) (RelaySettings, error) {
	toml_ := t.RelaySettings()
	db := make(map[string]string, 4)
	for _, k := range []string{"defaultRelayTtl", "relayEndpoint", "mirrorEndpoint", "defaultShareTransport"} {
		v, err := lookup(k)
		if err != nil {
			return RelaySettings{}, fmt.Errorf("read config key %s: %w", k, err)
		}
		db[k] = v
	}
	pick := func(fromTOML, key, def string) string {
		if fromTOML != "" {
			return fromTOML
		}
		if db[key] != "" {
			return db[key]
		}
		return def
	}
	r := RelaySettings{
		DefaultRelayTtl:       pick(toml_.DefaultRelayTtl, "defaultRelayTtl", DefaultRelayTtl),
		RelayEndpoint:         pick(toml_.RelayEndpoint, "relayEndpoint", DefaultRelayEndpoint),
		MirrorEndpoint:        pick(toml_.MirrorEndpoint, "mirrorEndpoint", ""),
		DefaultShareTransport: pick(toml_.DefaultShareTransport, "defaultShareTransport", DefaultShareTransport),
	}
	if !ValidRelayTtl(r.DefaultRelayTtl) {
		return r, fmt.Errorf("invalid defaultRelayTtl %q (want 1d, 7d, 14d or 30d)", r.DefaultRelayTtl)
	}
	return r, nil
}
