package install

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"text/template"
)

// launchdPlist is the user-agent plist (spec §7.3): RunAtLoad + KeepAlive,
// loaded with `launchctl bootstrap gui/$UID`, no root. It runs `serve`
// (stdio MCP) so headless MCP clients reach the daemon before a browser
// opens; the browser still spawns `host` on demand via the NM manifests.
var launchdPlist = template.Must(template.New("plist").Parse(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>fyi.illo.stash-daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>{{.DaemonPath}}</string>
    <string>serve</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>{{.StdoutPath}}</string>
  <key>StandardErrorPath</key>
  <string>{{.StderrPath}}</string>
</dict>
</plist>
`))

// systemdUnit is the user unit (spec §7.3): enabled with
// `systemctl --user enable --now`, plus `loginctl enable-linger $USER` to
// survive logout.
var systemdUnit = template.Must(template.New("unit").Parse(`[Unit]
Description=Stash daemon (local-first stash MCP server)
After=network.target

[Service]
ExecStart={{.DaemonPath}} serve
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
`))

type unitData struct {
	DaemonPath string
	StdoutPath string
	StderrPath string
}

// writeAutostart installs the launchd user agent (darwin) or systemd user
// unit (linux) and prints the enable command for the user to run. The unit
// itself never runs privileged commands on the user's behalf.
func writeAutostart(daemonPath string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home: %w", err)
	}
	data := unitData{DaemonPath: daemonPath}
	var path string
	var tmpl *template.Template
	switch runtime.GOOS {
	case "darwin":
		path = filepath.Join(home, "Library", "LaunchAgents", "fyi.illo.stash-daemon.plist")
		data.StdoutPath = filepath.Join(home, "Library", "Logs", "stash-daemon.out.log")
		data.StderrPath = filepath.Join(home, "Library", "Logs", "stash-daemon.err.log")
		tmpl = launchdPlist
	case "linux":
		path = filepath.Join(home, ".config", "systemd", "user", "stash-daemon.service")
		tmpl = systemdUnit
	default:
		return "", fmt.Errorf("autostart is not supported on %s (macOS launchd and Linux systemd only)", runtime.GOOS)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	f, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	if err := tmpl.Execute(f, data); err != nil {
		return "", err
	}
	fmt.Println(enableHint(runtime.GOOS))
	return path, nil
}

func enableHint(goos string) string {
	if goos == "darwin" {
		return "run: launchctl bootstrap gui/$UID ~/Library/LaunchAgents/fyi.illo.stash-daemon.plist"
	}
	return "run: systemctl --user daemon-reload && systemctl --user enable --now stash-daemon.service (and loginctl enable-linger $USER to survive logout)"
}
