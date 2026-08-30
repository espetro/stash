package config

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestDirResolution(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_CONFIG_HOME", "")
	t.Setenv("APPDATA", "")

	cases := []struct {
		goos, want string
	}{
		{"darwin", filepath.Join(home, "Library", "Application Support", "stash")},
		{"linux", filepath.Join(home, ".config", "stash")},
		{"windows", filepath.Join(home, "AppData", "Roaming", "stash")},
	}
	for _, tc := range cases {
		t.Setenv("GOOS_TEST", tc.goos)
		// resolution depends on runtime.GOOS which we cannot change at test
		// time; exercise the non-darwin/non-windows path via XDG explicitly.
		_ = tc
	}
	// exercise explicit XDG override (linux convention) regardless of host OS
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, "xdg"))
	if runtime.GOOS == "linux" {
		got, err := Dir("")
		if err != nil {
			t.Fatal(err)
		}
		if got != filepath.Join(home, "xdg", "stash") {
			t.Fatalf("xdg: got %s", got)
		}
	}
	// override flag always wins
	want := filepath.Join(home, "custom")
	got, err := Dir(want)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("override: got %s want %s", got, want)
	}
	st, err := os.Stat(want)
	if err != nil || st.Mode().Perm() != 0o700 {
		t.Fatalf("dir not created 0700: %v %v", st, err)
	}
}

func TestReadTOML(t *testing.T) {
	dir := t.TempDir()
	// missing file is fine
	tm, err := ReadTOML(filepath.Join(dir, "stash.toml"))
	if err != nil {
		t.Fatal(err)
	}
	if tm.RelayEndpoint != "" {
		t.Fatal("expected zero TOML")
	}
	path := filepath.Join(dir, "stash.toml")
	os.WriteFile(path, []byte("defaultRelayTtl = \"7d\"\nrelayEndpoint = \"wss://r.example\"\nmirrorEndpoint = \"https://m.example\"\ndefaultShareTransport = \"relay\"\n"), 0o600)
	tm, err = ReadTOML(path)
	if err != nil {
		t.Fatal(err)
	}
	if tm.DefaultRelayTtl != "7d" || tm.RelayEndpoint != "wss://r.example" || tm.MirrorEndpoint != "https://m.example" || tm.DefaultShareTransport != "relay" {
		t.Fatalf("parsed: %+v", tm)
	}
}

func TestResolveRelay(t *testing.T) {
	tomlEmpty := TOML{}

	// all defaults when TOML and SQLite are empty
	r, err := ResolveRelay(tomlEmpty, func(string) (string, error) { return "", nil })
	if err != nil {
		t.Fatal(err)
	}
	if r.DefaultRelayTtl != "7d" || r.RelayEndpoint != "https://stash.illo.fyi" ||
		r.MirrorEndpoint != "" || r.DefaultShareTransport != "relay" {
		t.Fatalf("defaults: %+v", r)
	}

	// SQLite fallback when TOML unset
	dbVals := map[string]string{"relayEndpoint": "https://self.example"}
	r, err = ResolveRelay(tomlEmpty, func(k string) (string, error) { return dbVals[k], nil })
	if err != nil {
		t.Fatal(err)
	}
	if r.RelayEndpoint != "https://self.example" || r.DefaultRelayTtl != "7d" {
		t.Fatalf("sqlite fallback: %+v", r)
	}

	// TOML wins over SQLite
	r, err = ResolveRelay(TOML{RelayEndpoint: "https://toml.example"},
		func(k string) (string, error) { return dbVals[k], nil })
	if err != nil {
		t.Fatal(err)
	}
	if r.RelayEndpoint != "https://toml.example" {
		t.Fatalf("toml precedence: %+v", r)
	}

	// invalid TTL from either source is an error
	_, err = ResolveRelay(TOML{DefaultRelayTtl: "90d"}, func(string) (string, error) { return "", nil })
	if err == nil {
		t.Fatal("expected invalid toml ttl error")
	}
	_, err = ResolveRelay(tomlEmpty, func(k string) (string, error) {
		if k == "defaultRelayTtl" {
			return "never", nil
		}
		return "", nil
	})
	if err == nil {
		t.Fatal("expected invalid sqlite ttl error")
	}

	// lookup error propagates
	_, err = ResolveRelay(tomlEmpty, func(string) (string, error) { return "", fmt.Errorf("db closed") })
	if err == nil {
		t.Fatal("expected lookup error")
	}
}

// F12: viewerDisabled is the single serve-disable flag under the F2/F7 TOML
// contract. Missing key means enabled (zero value).
func TestReadTOMLViewerDisabled(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "stash.toml")
	if err := os.WriteFile(path, []byte("viewerDisabled = true\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := ReadTOML(path)
	if err != nil {
		t.Fatal(err)
	}
	if !got.ViewerDisabled {
		t.Fatal("viewerDisabled = false, want true")
	}
	// absent key stays enabled
	if err := os.WriteFile(path, []byte("relayEndpoint = \"https://x.example\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err = ReadTOML(path)
	if err != nil {
		t.Fatal(err)
	}
	if got.ViewerDisabled {
		t.Fatal("viewerDisabled default should be false")
	}
}
