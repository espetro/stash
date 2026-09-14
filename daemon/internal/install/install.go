// Package install implements `stash-daemon install` and `uninstall`
// (F10): native-messaging host-manifest placement, launchd/systemd autostart
// opt-in, and clean removal.
//
// The host manifest shape and install locations mirror F1's
// apps/extension/lib/native-messaging/manifest.ts verbatim (HOST_NAME
// io.illo.stash, GECKO_EXTENSION_ID stash@stash-extension, chrome
// allowed_origins / firefox allowed_extensions); manifest.ts is TypeScript
// and cannot be imported by the Go binary, so the constants are duplicated
// here intentionally. doctor verifies the same locations.
package install

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

const (
	// HostName is the native-messaging host name (F1 HOST_NAME). Must match
	// apps/extension/lib/native-messaging/manifest.ts and the host name the
	// extension passes to runtime.connectNative.
	HostName = "io.illo.stash"
	// GeckoExtensionID is the Firefox extension id (F1 GECKO_EXTENSION_ID).
	GeckoExtensionID = "stash@stash-extension"
	// ChromeExtensionID is the Chrome Web Store extension id. Determined at
	// store publication; install --chrome-id overrides.
	ChromeExtensionID = "mhipkdochajohklmmjinmicahanmldbj"
)

// HostManifest is the native-messaging host manifest (F1 buildHostManifest).
type HostManifest struct {
	Name           string   `json:"name"`
	Type           string   `json:"type"`
	Path           string   `json:"path"`
	AllowedOrigins []string `json:"allowed_origins,omitempty"`
	AllowedExts    []string `json:"allowed_extensions,omitempty"`
}

// manifestPaths returns the filesystem path of the host manifest for each
// browser on the current OS (F1 installLocation; windows callers must use
// the registry instead — not supported by this installer).
func manifestPaths(home string) (map[string]string, error) {
	switch runtime.GOOS {
	case "darwin":
		return map[string]string{
			"chrome":  filepath.Join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", HostName+".json"),
			"firefox": filepath.Join(home, "Library", "Application Support", "Mozilla", "NativeMessagingHosts", HostName+".json"),
		}, nil
	case "linux":
		return map[string]string{
			"chrome":  filepath.Join(home, ".config", "google-chrome", "NativeMessagingHosts", HostName+".json"),
			"firefox": filepath.Join(home, ".mozilla", "native-messaging-hosts", HostName+".json"),
		}, nil
	default:
		return nil, fmt.Errorf("install is not supported on %s; register the host manifest manually (see docs/install.md)", runtime.GOOS)
	}
}

// buildManifest builds the host manifest for one browser, mirroring F1's
// buildHostManifest (chrome requires allowed_origins with the store id, no
// wildcards; firefox uses allowed_extensions).
func buildManifest(browser, daemonPath, chromeExtensionID string) (*HostManifest, error) {
	if !filepath.IsAbs(daemonPath) {
		return nil, fmt.Errorf("daemon path must be absolute, got %q", daemonPath)
	}
	m := &HostManifest{Name: HostName, Type: "stdio", Path: daemonPath}
	if browser == "chrome" {
		if chromeExtensionID == "" {
			return nil, fmt.Errorf("chrome requires a chrome extension id (--chrome-id)")
		}
		m.AllowedOrigins = []string{"chrome-extension://" + chromeExtensionID + "/"}
	} else {
		m.AllowedExts = []string{GeckoExtensionID}
	}
	return m, nil
}

// Install writes the host manifest(s) and optionally the autostart unit.
// browsers selects which manifests to write ("chrome", "firefox" or both).
func Install(daemonPath string, browsers []string, chromeExtensionID string, autostart bool) ([]string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve home: %w", err)
	}
	if daemonPath == "" {
		exe, err := os.Executable()
		if err != nil {
			return nil, fmt.Errorf("resolve executable: %w", err)
		}
		daemonPath, err = filepath.EvalSymlinks(exe)
		if err != nil {
			return nil, fmt.Errorf("resolve executable: %w", err)
		}
	}
	paths, err := manifestPaths(home)
	if err != nil {
		return nil, err
	}

	var written []string
	for _, b := range browsers {
		p, ok := paths[b]
		if !ok {
			return written, fmt.Errorf("unknown browser %q (want chrome and/or firefox)", b)
		}
		m, err := buildManifest(b, daemonPath, chromeExtensionID)
		if err != nil {
			return written, err
		}
		if err := writeJSON(p, m); err != nil {
			return written, err
		}
		written = append(written, p)
	}
	if autostart {
		p, err := writeAutostart(daemonPath)
		if err != nil {
			return written, err
		}
		written = append(written, p)
	}
	return written, nil
}

// writeJSON writes v as pretty-printed JSON, creating parent dirs (0755)
// and the file itself (0644).
func writeJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create %s: %w", filepath.Dir(path), err)
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, append(b, '\n'), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}
