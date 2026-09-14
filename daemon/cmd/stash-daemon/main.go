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
	"github.com/espetro/stash/daemon/internal/logging"
	"github.com/espetro/stash/daemon/internal/mcpserver"
	"github.com/espetro/stash/daemon/internal/natmsg"
	"github.com/espetro/stash/daemon/internal/store"
	"github.com/espetro/stash/daemon/internal/viewer"
	"net/http"
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
	fs := flag.NewFlagSet("stash-daemon", flag.ExitOnError)
	fs.StringVar(&configDir, "config-dir", "", "override config directory")
	fs.BoolVar(&jsonOut, "json", false, "machine-readable JSON output")
	fs.StringVar(&origin, "origin", "", "host mode: extension origin (escape hatch)")
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "stash-daemon <serve|host|status|doctor> [flags]\n\nFlags:\n")
		fs.PrintDefaults()
	}
	fs.Parse(os.Args[1:])
	args := fs.Args()

	if len(args) == 0 && looksLikeNMInvocation(os.Args[1:]) {
		runHost(configDir, "") // browser passed the origin as argv[1]
		return
	}

	cmd := "serve"
	if len(args) > 0 {
		cmd = args[0]
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

	// F12: serve the embedded viewer shell on loopback unless disabled via
	// stash.toml (viewerDisabled). Loopback only, no new external surface.
	if tm, tmErr := config.ReadTOML(paths.TOMLFile); tmErr == nil && tm.ViewerDisabled {
		lw.Info("viewer disabled by config", nil)
	} else if viewer.Placeholder() {
		lw.Event("warn", "viewer dist placeholder embedded; build the viewer before packaging the daemon", nil)
	} else if vs, err := viewer.NewServer(); err != nil {
		lw.Error("viewer server init", map[string]any{"err": err.Error()})
	} else if ln, err := vs.Listen(viewer.Options{}); err != nil {
		lw.Error("viewer listen", map[string]any{"err": err.Error()})
	} else {
		lw.Info("viewer listening", map[string]any{"url": "http://" + ln.Addr().String() + "/"})
		_ = st.SetConfig("viewerURL", "http://"+ln.Addr().String())
		fmt.Fprintf(os.Stderr, "stash viewer: http://%s/\n", ln.Addr().String())
		go func() {
			srvErr := http.Serve(ln, vs.Handler())
			if srvErr != nil && srvErr != http.ErrServerClosed {
				lw.Error("viewer serve", map[string]any{"err": srvErr.Error()})
			}
		}()
	}

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

	// F12: surface the loopback viewer URL written by the serve loop (empty
	// when the daemon has not served since this config db was created or
	// when the viewer is disabled).
	viewerURL, _ := st.GetConfig("viewerURL")

	if jsonOut {
		out, _ := json.MarshalIndent(map[string]any{
			"configDir": paths.Dir, "pid": pid, "alive": alive,
			"browsers":    peers,
			"outboxDepth": depth,
			"viewerURL":   viewerURL,
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
	if viewerURL != "" {
		fmt.Printf("viewer:       %s\n", viewerURL)
	}
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
