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
type TOML struct {
	DefaultRelayTtl     string `toml:"defaultRelayTtl"`
	RelayEndpoint       string `toml:"relayEndpoint"`
	MirrorEndpoint      string `toml:"mirrorEndpoint"`
	DefaultShareTransport string `toml:"defaultShareTransport"`
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
