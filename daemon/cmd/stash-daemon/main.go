// Command stash-daemon is the local-first daemon binary: stdio MCP server,
// native-messaging host, status and doctor diagnostics.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"runtime/debug"
	"strings"

	"github.com/espetro/stash/daemon/internal/config"
	"github.com/espetro/stash/daemon/internal/doctor"
	"github.com/espetro/stash/daemon/internal/install"
	"github.com/espetro/stash/daemon/internal/logging"
	"github.com/espetro/stash/daemon/internal/mcpserver"
	"github.com/espetro/stash/daemon/internal/natmsg"
	"github.com/espetro/stash/daemon/internal/store"
)

// version is injected via -ldflags "-X main.version=vX.Y.Z" at build time.
var version = "dev"

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "version") {
		fmt.Println(buildVersion())
		return
	}
	var configDir string
	var jsonOut bool
	var origin string
	var chromeID string
	var autostart bool
	var yes bool
	fs := flag.NewFlagSet("stash-daemon", flag.ExitOnError)
	fs.StringVar(&configDir, "config-dir", "", "override config directory")
	fs.BoolVar(&jsonOut, "json", false, "machine-readable JSON output")
	fs.StringVar(&origin, "origin", "", "host mode: extension origin (escape hatch)")
	fs.StringVar(&chromeID, "chrome-id", "", "install: Chrome extension id override (default: store id)")
	fs.BoolVar(&autostart, "autostart", false, "install: also install the launchd/systemd user unit")
	fs.BoolVar(&yes, "yes", false, "uninstall: skip the data-deletion prompt")
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "	stash-daemon <serve|host|status|doctor|install|uninstall> [flags]\n\nFlags:\n")
		fs.PrintDefaults()
	}
	// Accept flags on either side of the subcommand
	// (`stash-daemon install --autostart` and `stash-daemon --autostart
	// install` both work): parse global flags, then re-parse any remainder.
	// First pass over everything; flag.ExitOnError stops at the first
	// non-flag (the subcommand) and leaves the rest in Args().
	if err := fs.Parse(os.Args[1:]); err != nil && err != flag.ErrHelp {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(2)
	}
	args := fs.Args()
	if len(args) > 1 {
		// Second pass: parse everything after the subcommand so flags can
		// follow it (`stash-daemon install --autostart`). Preserve the
		// subcommand (args[0]); it is consumed by the switch below.
		sub := args[0]
		if err := fs.Parse(args[1:]); err != nil && err != flag.ErrHelp {
			fmt.Fprintln(os.Stderr, "fatal:", err)
			os.Exit(2)
		}
		args = append([]string{sub}, fs.Args()...)
	}

	if len(args) == 0 && looksLikeNMInvocation(os.Args[1:]) {
		runHost(configDir, "") // browser passed the origin as argv[1]
		return
	}

	// The subcommand is the first positional arg from the first pass; keep it
	// even when the second pass consumes the flags that follow it.
	cmd := "serve"
	if len(args) > 0 {
		cmd = args[0]
	}
	if len(args) > 1 {
		args = args[1:]
	}
	switch cmd {
	case "serve":
		runServe(configDir)
	case "host":
		org := origin
		if org == "" && len(args) > 0 {
			org = args[0]
		}
		runHost(configDir, org)
	case "status":
		runStatus(configDir, jsonOut)
	case "doctor":
		runDoctor(configDir, jsonOut)
	case "install":
		runInstall(chromeID, autostart)
	case "uninstall":
		runUninstall(configDir, yes)
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q; run stash-daemon -h\n", cmd)
		os.Exit(2)
	}
}

func buildVersion() string {
	if version != "dev" {
		return version
	}
	if bi, ok := debug.ReadBuildInfo(); ok && bi.Main.Version != "" && bi.Main.Version != "(devel)" {
		return bi.Main.Version
	}
	return "dev"
}

// looksLikeNMInvocation detects a browser-launched host process: the browser
// passes the extension origin as argv[1] (chrome-extension:// or
// moz-extension://).
func looksLikeNMInvocation(args []string) bool {
	for _, arg := range args {
		if strings.HasPrefix(arg, "chrome-extension://") || strings.HasPrefix(arg, "moz-extension://") {
			return true
		}
	}
	return false
}

func setup(configDir string) (config.Paths, *logging.Writer, *store.Store, error) {
	dir, err := config.Dir(configDir)
	if err != nil {
		return config.Paths{}, nil, nil, err
	}
	paths := config.Layout(dir)
	lw, err := logging.New(paths.LogFile, 10<<20, 3)
	if err != nil {
		return paths, nil, nil, err
	}
	st, err := store.Open(paths.DB)
	if err != nil {
		lw.Close()
		return paths, lw, nil, err
	}
	return paths, lw, st, nil
}

func runServe(configDir string) {
	paths, lw, st, err := setup(configDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(1)
	}
	defer st.Close()
	defer lw.Close()
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	slog.SetDefault(logger)

	exe, _ := os.Executable()
	if err := mcpserver.WriteServerCard(paths.CardFile, exe); err != nil {
		lw.Error("write server card", map[string]any{"err": err.Error()})
	}
	writePid(paths.PidFile)
	defer os.Remove(paths.PidFile)

	// Read stash.toml relay keys (parsed, stored, unused until F7).
	if tm, err := config.ReadTOML(paths.TOMLFile); err == nil {
		for k, v := range map[string]string{
			"defaultRelayTtl": tm.DefaultRelayTtl, "relayEndpoint": tm.RelayEndpoint,
			"mirrorEndpoint": tm.MirrorEndpoint, "defaultShareTransport": tm.DefaultShareTransport,
		} {
			if v != "" {
				st.SetConfig(k, v)
			}
		}
	}

	lw.Info("serve start", map[string]any{"version": buildVersion(), "config_dir": paths.Dir})
	srv := &mcpserver.Server{Store: st, Log: logger}
	if err := srv.Serve(context.Background(), os.Stdin, os.Stdout); err != nil {
		lw.Error("serve exit", map[string]any{"err": err.Error()})
	}
}

func writePid(path string) {
	os.WriteFile(path, []byte(fmt.Sprintf("%d\n", os.Getpid())), 0o600)
}

func runHost(configDir, origin string) {
	paths, lw, st, err := setup(configDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(1)
	}
	defer st.Close()
	defer lw.Close()
	exe, _ := os.Executable()
	mcpserver.WriteServerCard(paths.CardFile, exe)
	writePid(paths.PidFile)
	defer os.Remove(paths.PidFile)

	lw.Info("host start", map[string]any{"origin": origin})
	if err := natmsg.RunHost(st, lw, os.Stdin, os.Stdout); err != nil {
		lw.Error("host exit", map[string]any{"err": err.Error()})
		os.Exit(1)
	}
}

func runStatus(configDir string, jsonOut bool) {
	dir, err := config.Dir(configDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(1)
	}
	paths := config.Layout(dir)
	st, err := store.Open(paths.DB)
	if err != nil {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(1)
	}
	defer st.Close()

	depth, _ := st.OutboxDepth()
	peers, _ := st.SyncPeers()
	alive, pid := doctor.CheckPidfile(paths.PidFile)

	if jsonOut {
		out, _ := json.MarshalIndent(map[string]any{
			"configDir": paths.Dir, "pid": pid, "alive": alive,
			"browsers":    peers,
			"outboxDepth": depth,
		}, "", "  ")
		fmt.Println(string(out))
		return
	}
	fmt.Printf("config dir:   %s\n", paths.Dir)
	if alive {
		fmt.Printf("daemon:       running (pid %d)\n", pid)
	} else {
		fmt.Println("daemon:       not running")
	}
	if len(peers) == 0 {
		fmt.Println("browsers:     none")
	}
	for _, p := range peers {
		fmt.Printf("browser:      %s (status %s)\n", p.PeerID, p.Status.String)
	}
	fmt.Printf("outbox depth: %d\n", depth)
}

func runDoctor(configDir string, jsonOut bool) {
	dir, err := config.Dir(configDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(1)
	}
	paths := config.Layout(dir)
	exe, _ := os.Executable()
	code := doctor.Run(os.Stdout, paths, exe, jsonOut, buildVersion())
	os.Exit(code)
}

// runInstall places the native-messaging host manifests (F10; F1 shape).
// chromeID overrides the built-in Chrome Web Store extension id.
func runInstall(chromeID string, autostart bool) {
	browsers := []string{"chrome", "firefox"}
	written, err := install.Install("", browsers, chromeID, autostart)
	if err != nil {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(1)
	}
	for _, p := range written {
		fmt.Println("installed:", p)
	}
	exe, _ := os.Executable()
	fmt.Printf("\nNext: point the extension at this host (%s), then run `stash-daemon doctor`.\n", exe)
}

// runUninstall removes host manifests and the autostart unit; with --yes it
// also deletes the config dir (SQLite, logs, stash.toml) without prompting
// (spec §7.6: always prompt before deleting the local library).
func runUninstall(configDir string, yes bool) {
	if !yes {
		dir, err := config.Dir(configDir)
		if err != nil {
			fmt.Fprintln(os.Stderr, "fatal:", err)
			os.Exit(1)
		}
		fmt.Printf("This deletes your local stash library at %s. Export first? [y/N] ", dir)
		var answer string
		fmt.Scanln(&answer)
		switch strings.ToLower(strings.TrimSpace(answer)) {
		case "y", "yes":
			fmt.Fprintln(os.Stderr, "export first (see docs), then re-run with --yes to delete data")
			return
		case "n", "no", "":
			// Proceed: remove manifests + unit, keep data.
		default:
			fmt.Fprintln(os.Stderr, "aborted")
			os.Exit(1)
		}
	}
	// --yes skips the prompt and deletes the config dir too (spec §7.6).
	deleteData := yes
	removed, err := install.Uninstall(deleteData, configDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(1)
	}
	for _, p := range removed {
		fmt.Println("removed:", p)
	}
	if !deleteData {
		dir, _ := config.Dir(configDir)
		fmt.Printf("\nData dir kept at %s; delete manually or re-run with --yes.\n", dir)
	}
}
