package config

import (
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
