package install

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// Uninstall removes the host manifest(s), the autostart unit and, when
// deleteData is set, the config dir (SQLite, logs, stash.toml) — spec §7.6:
// package-manager uninstall removes binary + manifests but not user data;
// `stash-daemon uninstall` owns data deletion and must prompt first.
func Uninstall(deleteData bool, configDir string) ([]string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve home: %w", err)
	}
	var removed []string

	if paths, err := manifestPaths(home); err == nil {
		for _, p := range paths {
			if err := os.Remove(p); err == nil {
				removed = append(removed, p)
			} else if !os.IsNotExist(err) {
				return removed, err
			}
		}
	}

	switch runtime.GOOS {
	case "darwin":
		p := filepath.Join(home, "Library", "LaunchAgents", "fyi.illo.stash-daemon.plist")
		if err := os.Remove(p); err == nil {
			removed = append(removed, p)
		} else if !os.IsNotExist(err) {
			return removed, err
		}
	case "linux":
		p := filepath.Join(home, ".config", "systemd", "user", "stash-daemon.service")
		if err := os.Remove(p); err == nil {
			removed = append(removed, p)
		} else if !os.IsNotExist(err) {
			return removed, err
		}
	}

	if deleteData {
		dir := configDir
		if dir == "" {
			// Resolve without creating: Dir() mkdirs on return, so compute
			// the default layout directly when no override was given.
			switch runtime.GOOS {
			case "darwin":
				dir = filepath.Join(home, "Library", "Application Support", "stash")
			case "windows":
				dir = filepath.Join(os.Getenv("APPDATA"), "stash")
			default:
				if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
					dir = filepath.Join(xdg, "stash")
				} else {
					dir = filepath.Join(home, ".config", "stash")
				}
			}
		}
		if err := os.RemoveAll(dir); err != nil {
			return removed, fmt.Errorf("remove %s: %w", dir, err)
		}
		removed = append(removed, dir)
	}
	return removed, nil
}
