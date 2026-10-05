// Package doctor implements the doctor and status diagnostics (spec 4.7).
package doctor

import (
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"syscall"

	"github.com/espetro/stash/daemon/internal/config"
	"github.com/espetro/stash/daemon/internal/install"
	"github.com/espetro/stash/daemon/internal/store"
)

// Status is the outcome of one check.
type Status string

// Check outcomes.
const (
	Pass Status = "PASS"
	Fail Status = "FAIL"
	Warn Status = "WARN"
)

// Result is one doctor check result.
type Result struct {
	Name   Status `json:"-"`
	Check  string `json:"check"`
	Status Status `json:"status"`
	Detail string `json:"detail"`
	Hint   string `json:"hint,omitempty"`
}

// Run executes all doctor checks against paths and prints results. It
// returns the process exit code (1 if any FAIL).
func Run(out io.Writer, paths config.Paths, exePath string, jsonOut bool, version string) int {
	results := []Result{
		checkConfigDir(paths),
		checkSQLite(paths),
		checkNMManifests(exePath),
		checkCodecFixtures(),
		checkStoreWrite(paths),
	}
	failed := false
	for _, r := range results {
		if r.Status == Fail {
			failed = true
		}
	}
	if jsonOut {
		b, _ := json.MarshalIndent(map[string]any{"version": version, "configDir": paths.Dir, "results": results, "ok": !failed}, "", "  ")
		fmt.Fprintln(out, string(b))
	} else {
		fmt.Fprintf(out, "stash-daemon %s\nconfig dir: %s\n\n", version, paths.Dir)
		for _, r := range results {
			fmt.Fprintf(out, "  [%s] %-22s %s\n", r.Status, r.Check, r.Detail)
			if r.Hint != "" {
				fmt.Fprintf(out, "         hint: %s\n", r.Hint)
			}
		}
		if failed {
			fmt.Fprintln(out, "\ndiagnosis found failures; re-run stash-daemon doctor after fixing.")
		} else {
			fmt.Fprintln(out, "\nall checks passed; re-run stash-daemon doctor any time.")
		}
	}
	if failed {
		return 1
	}
	return 0
}

func checkConfigDir(p config.Paths) Result {
	st, err := os.Stat(p.Dir)
	if err != nil || !st.IsDir() {
		return Result{Check: "config dir", Status: Fail, Detail: fmt.Sprintf("missing: %s", p.Dir),
			Hint: "run any stash-daemon command once to create it, then re-run stash-daemon doctor"}
	}
	probe := filepath.Join(p.Dir, ".doctor-probe")
	if err := os.WriteFile(probe, []byte("x"), 0o600); err != nil {
		return Result{Check: "config dir", Status: Fail, Detail: "not writable", Hint: "check ownership of " + p.Dir + "; run stash-daemon doctor again after fixing"}
	}
	os.Remove(probe)
	return Result{Check: "config dir", Status: Pass, Detail: p.Dir}
}

func checkSQLite(p config.Paths) Result {
	st, err := store.Open(p.DB)
	if err != nil {
		return Result{Check: "sqlite", Status: Fail, Detail: err.Error(),
			Hint: "stash.db may be corrupted; move it aside and re-run stash-daemon doctor"}
	}
	defer st.Close()
	var mode string
	if err := st.DB().QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil || mode != "wal" {
		return Result{Check: "sqlite", Status: Fail, Detail: fmt.Sprintf("journal_mode=%s", mode),
			Hint: "expected WAL mode; re-run stash-daemon doctor after reopening the database"}
	}
	var ic string
	st.DB().QueryRow("PRAGMA integrity_check").Scan(&ic)
	if ic != "ok" {
		return Result{Check: "sqlite", Status: Fail, Detail: "integrity_check: " + ic,
			Hint: "database corruption detected; restore from backup and re-run stash-daemon doctor"}
	}
	v, _ := st.CurrentVersion()
	if v < 1 {
		return Result{Check: "sqlite", Status: Warn, Detail: fmt.Sprintf("migration version %d", v),
			Hint: "schema behind expectation; re-run stash-daemon doctor"}
	}
	return Result{Check: "sqlite", Status: Pass, Detail: fmt.Sprintf("wal, integrity ok, migration v%d", v)}
}

// NMManifest is the native-messaging manifest shape doctor verifies.
type NMManifest struct {
	Name           string   `json:"name"`
	Type           string   `json:"type"`
	Path           string   `json:"path"`
	AllowedOrigins []string `json:"allowed_origins,omitempty"`
	AllowedExts    []string `json:"allowed_extensions,omitempty"`
}

// NMManifestPaths returns the expected manifest paths per browser for the
// current OS. F1 owns writing them; doctor only verifies.
func NMManifestPaths() []string {
	home, _ := os.UserHomeDir()
	var paths []string
	// Paths are populated by F1's installer; verify whichever exist. Include
	// the canonical Chrome + Firefox locations for darwin/linux.
	for _, p := range []string{
		filepath.Join(home, "Library/Application Support/Google/Chrome/NativeMessagingHosts/"+install.HostName+".json"),
		filepath.Join(home, ".config/google-chrome/NativeMessagingHosts/"+install.HostName+".json"),
		filepath.Join(home, "Library/Application Support/Mozilla/NativeMessagingHosts/"+install.HostName+".json"),
		filepath.Join(home, ".mozilla/native-messaging-hosts/"+install.HostName+".json"),
	} {
		paths = append(paths, p)
	}
	return paths
}

func checkNMManifests(exePath string) Result {
	found := 0
	var detail, hint string
	for _, mp := range NMManifestPaths() {
		b, err := os.ReadFile(mp)
		if err != nil {
			continue
		}
		found++
		var m NMManifest
		if err := json.Unmarshal(b, &m); err != nil {
			return Result{Check: "nm manifests", Status: Fail, Detail: "unparsable: " + mp,
				Hint: "reinstall the browser pairing; then re-run stash-daemon doctor"}
		}
		abs, _ := filepath.Abs(m.Path)
		if abs != exePath {
			return Result{Check: "nm manifests", Status: Fail,
				Detail: fmt.Sprintf("%s points at %s, not this binary", filepath.Base(mp), m.Path),
				Hint:   fmt.Sprintf("expected %s; re-run stash-daemon doctor after reinstalling the daemon", exePath)}
		}
	}
	if found == 0 {
		detail = "no native-messaging manifests found"
		hint = "pair a browser with the F1 installer; then re-run stash-daemon doctor (this is WARN until paired)"
		return Result{Check: "nm manifests", Status: Warn, Detail: detail, Hint: hint}
	}
	return Result{Check: "nm manifests", Status: Pass, Detail: fmt.Sprintf("%d manifest(s) point at this binary", found)}
}

//go:embed testdata/v6-fixtures.json
var fixturesJSON []byte

type v6Fixture struct {
	Name    string `json:"name"`
	Payload string `json:"payload"`
	ItemURL string `json:"itemUrl"`
}

// checkCodecFixtures runs the embedded v6 fixture self-test subset. Full
// conformance arrives with F3; here we verify the fixture vectors are
// internally decodable down to the base64url payload segment.
func checkCodecFixtures() Result {
	var fixtures []v6Fixture
	if err := json.Unmarshal(fixturesJSON, &fixtures); err != nil || len(fixtures) == 0 {
		return Result{Check: "codec fixtures", Status: Warn, Detail: "no embedded fixtures loaded",
			Hint: "fixture set incomplete; re-run stash-daemon doctor after upgrading"}
	}
	for _, f := range fixtures {
		// fixture payload is "p=<base64url>"; validate it round-trips as raw
		// bytes (real v6 decode is F3).
		raw, err := base64.RawURLEncoding.DecodeString(f.Payload)
		if err != nil || len(raw) == 0 {
			return Result{Check: "codec fixtures", Status: Fail, Detail: "fixture " + f.Name + " not decodable",
				Hint: "embedded fixture corrupted; re-run stash-daemon doctor after upgrading"}
		}
	}
	return Result{Check: "codec fixtures", Status: Pass, Detail: fmt.Sprintf("%d v6 vectors", len(fixtures))}
}

// checkStoreWrite proves the store accepts writes: insert a probe row in a
// transaction, read it back, then roll back so nothing is persisted.
func checkStoreWrite(p config.Paths) Result {
	st, err := store.Open(p.DB)
	if err != nil {
		return Result{Check: "store write", Status: Fail, Detail: err.Error(), Hint: "re-run stash-daemon doctor"}
	}
	defer st.Close()
	tx, err := st.DB().Begin()
	if err != nil {
		return Result{Check: "store write", Status: Fail, Detail: err.Error(), Hint: "re-run stash-daemon doctor"}
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO stash_records(id,title,url,items_json,created_at,updated_at,origin,deleted,crdt_seq,tags_json,note,kept,shares_json,extra_json,rev)
		VALUES('__doctor_probe__','probe','probe://x','[]',1,1,NULL,0,0,'[]',NULL,1,'[]','{}',0)`); err != nil {
		return Result{Check: "store write", Status: Fail, Detail: err.Error(), Hint: "re-run stash-daemon doctor"}
	}
	var title string
	if err := tx.QueryRow(`SELECT title FROM stash_records WHERE id = '__doctor_probe__'`).Scan(&title); err != nil {
		return Result{Check: "store write", Status: Fail, Detail: "probe read-back failed: " + err.Error(), Hint: "re-run stash-daemon doctor"}
	}
	return Result{Check: "store write", Status: Pass, Detail: "probe row round-trips (rolled back)"}
}

// CheckPidfile reads <config>/daemon.pid and reports liveness.
func CheckPidfile(path string) (bool, int) {
	b, err := os.ReadFile(path)
	if err != nil {
		return false, 0
	}
	var pid int
	if _, err := fmt.Sscanf(string(b), "%d", &pid); err != nil {
		return false, 0
	}
	if pid <= 0 {
		return false, pid
	}
	// signal 0 probes liveness without side effects
	p, err := os.FindProcess(pid)
	if err != nil {
		return false, pid
	}
	if err := p.Signal(syscall.Signal(0)); err != nil {
		return false, pid
	}
	return true, pid
}
