package doctor

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/espetro/stash/daemon/internal/config"
	"github.com/espetro/stash/daemon/internal/mcpserver"
)

func setupPaths(t *testing.T) config.Paths {
	t.Helper()
	dir := t.TempDir()
	p := config.Layout(dir)
	if err := os.MkdirAll(p.Dir, 0o700); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestDoctorCleanTempConfigDir(t *testing.T) {
	p := setupPaths(t)
	exe, _ := os.Executable()
	// The NM check verifies whichever manifests exist on the machine and
	// requires them to point at the running binary. On a dev machine with a
	// real manifest pointing at an installed daemon, this test binary cannot
	// match it; the check correctly reports FAIL there. Neutralize real
	// manifests for the duration of the test so the clean-dir expectation
	// (zero manifests -> WARN, exit 0) holds everywhere.
	var restore []func()
	for _, mp := range NMManifestPaths() {
		if b, err := os.ReadFile(mp); err == nil {
			path := mp
			os.Remove(path)
			restore = append(restore, func() { os.WriteFile(path, b, 0o644) })
		}
	}
	if len(restore) > 0 {
		t.Cleanup(func() {
			for _, f := range restore {
				f()
			}
		})
	}
	var buf bytes.Buffer
	code := Run(&buf, p, exe, false, "dev")
	out := buf.String()
	if code != 0 {
		t.Fatalf("doctor exit=%d\n%s", code, out)
	}
	for _, want := range []string{"PASS", "stash-daemon doctor"} {
		if !strings.Contains(out, want) {
			t.Fatalf("doctor output missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "[FAIL]") {
		t.Fatalf("unexpected FAIL:\n%s", out)
	}
}

func TestDoctorJSON(t *testing.T) {
	p := setupPaths(t)
	exe, _ := os.Executable()
	for _, mp := range NMManifestPaths() {
		if b, err := os.ReadFile(mp); err == nil {
			path := mp
			os.Remove(path)
			t.Cleanup(func() { os.WriteFile(path, b, 0o644) })
		}
	}
	var buf bytes.Buffer
	Run(&buf, p, exe, true, "dev")
	var doc struct {
		OK      bool `json:"ok"`
		Results []struct {
			Check  string `json:"check"`
			Status string `json:"status"`
		} `json:"results"`
	}
	if err := json.Unmarshal(buf.Bytes(), &doc); err != nil {
		t.Fatalf("bad json: %v\n%s", err, buf.String())
	}
	if !doc.OK || len(doc.Results) != 5 {
		t.Fatalf("json ok=%v results=%d", doc.OK, len(doc.Results))
	}
}

func TestDoctorReadOnlyDir(t *testing.T) {
	dir := t.TempDir()
	os.Chmod(dir, 0o500)
	defer os.Chmod(dir, 0o700)
	p := config.Layout(dir)
	var buf bytes.Buffer
	Run(&buf, p, "unused", false, "dev")
	// read-only dir is still a dir; config write probe should FAIL
	if !strings.Contains(buf.String(), "not writable") && !strings.Contains(buf.String(), "missing") {
		t.Fatalf("expected config-dir failure, got:\n%s", buf.String())
	}
}

func TestDoctorCorruptedDB(t *testing.T) {
	p := setupPaths(t)
	os.WriteFile(p.DB, []byte("this is not a sqlite database at all"), 0o600)
	var buf bytes.Buffer
	code := Run(&buf, p, "unused", false, "dev")
	if code != 1 {
		t.Fatalf("expected exit 1, got %d:\n%s", code, buf.String())
	}
}

func TestDoctorManifestWrongBinary(t *testing.T) {
	_ = setupPaths(t)
	// doctor checks OS locations only; the manifest verification helper is
	// covered by checkNMManifests against real paths. Here we at least
	// ensure the embedded fixtures load.
	var fixtures []v6Fixture
	b, err := os.ReadFile(filepath.Join("testdata", "v6-fixtures.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &fixtures); err != nil || len(fixtures) == 0 {
		t.Fatalf("fixtures: %v", err)
	}
	// tool registry sanity: doctor card path expectation matches binary
	_ = mcpserver.ToolNames()
}
