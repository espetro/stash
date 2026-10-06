package install

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func manifestJSON(t *testing.T, path string) map[string]any {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestBuildManifestChrome(t *testing.T) {
	m, err := buildManifest("chrome", "/usr/local/bin/stash-daemon", "abcdef")
	if err != nil {
		t.Fatal(err)
	}
	if m.Name != HostName || m.Type != "stdio" || m.Path != "/usr/local/bin/stash-daemon" {
		t.Fatalf("unexpected manifest: %+v", m)
	}
	if len(m.AllowedOrigins) != 1 || m.AllowedOrigins[0] != "chrome-extension://abcdef/" {
		t.Fatalf("allowed_origins: %v", m.AllowedOrigins)
	}
	if len(m.AllowedExts) != 0 {
		t.Fatalf("chrome manifest must not have allowed_extensions")
	}
}

func TestBuildManifestChromeRequiresID(t *testing.T) {
	if _, err := buildManifest("chrome", "/bin/x", ""); err == nil {
		t.Fatal("want error for missing chrome extension id")
	}
}

func TestBuildManifestFirefox(t *testing.T) {
	m, err := buildManifest("firefox", "/usr/local/bin/stash-daemon", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(m.AllowedExts) != 1 || m.AllowedExts[0] != GeckoExtensionID {
		t.Fatalf("allowed_extensions: %v", m.AllowedExts)
	}
	if len(m.AllowedOrigins) != 0 {
		t.Fatalf("firefox manifest must not have allowed_origins")
	}
}

func TestBuildManifestRejectsRelativePath(t *testing.T) {
	if _, err := buildManifest("firefox", "stash-daemon", ""); err == nil {
		t.Fatal("want error for relative daemon path")
	}
}

func TestInstallWritesManifests(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	daemon := filepath.Join(home, "bin", "stash-daemon")
	written, err := Install(daemon, []string{"chrome", "firefox"}, "extid", false)
	if err != nil {
		t.Fatal(err)
	}
	if len(written) != 2 {
		t.Fatalf("want 2 manifests, got %v", written)
	}
	paths, err := manifestPaths(home)
	if err != nil {
		t.Fatal(err)
	}
	for browser, p := range paths {
		m := manifestJSON(t, p)
		if m["path"] != daemon {
			t.Errorf("%s: path = %v", browser, m["path"])
		}
		if m["name"] != HostName {
			t.Errorf("%s: name = %v", browser, m["name"])
		}
	}
	chrome := manifestJSON(t, paths["chrome"])
	if chrome["allowed_origins"] == nil {
		t.Error("chrome manifest missing allowed_origins")
	}
	firefox := manifestJSON(t, paths["firefox"])
	if firefox["allowed_extensions"] == nil {
		t.Error("firefox manifest missing allowed_extensions")
	}
}

func TestManifestPathsMatchF1Locations(t *testing.T) {
	home := "/home/x"
	if runtime.GOOS == "linux" {
		paths, err := manifestPaths(home)
		if err != nil {
			t.Fatal(err)
		}
		wantChrome := home + "/.config/google-chrome/NativeMessagingHosts/" + HostName + ".json"
		wantFirefox := home + "/.mozilla/native-messaging-hosts/" + HostName + ".json"
		if paths["chrome"] != wantChrome || paths["firefox"] != wantFirefox {
			t.Fatalf("got %v", paths)
		}
	}
	// darwin locations are exercised on darwin runners via the install test;
	// windows is unsupported by design (registry handoff).
}

func TestUninstallRemovesManifestsAndOptionallyData(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	if _, err := Install("/bin/stash-daemon", []string{"chrome"}, "x", false); err != nil {
		t.Fatal(err)
	}
	paths, _ := manifestPaths(home)
	if _, err := os.Stat(paths["chrome"]); err != nil {
		t.Fatal("manifest not written")
	}

	// Without deleteData: manifests go, data dir stays.
	removed, err := Uninstall(false, "")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.Join(removed, ","), HostName+".json") {
		t.Fatalf("manifest not in removed list: %v", removed)
	}
	if _, err := os.Stat(paths["chrome"]); !os.IsNotExist(err) {
		t.Fatal("manifest still present")
	}

	// With deleteData: config dir is removed.
	datadir := filepath.Join(home, "cfg", "stash")
	if err := os.MkdirAll(datadir, 0o755); err != nil {
		t.Fatal(err)
	}
	removed, err = Uninstall(true, datadir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(datadir); !os.IsNotExist(err) {
		t.Fatal("config dir still present")
	}
	if !strings.Contains(strings.Join(removed, ","), datadir) {
		t.Fatalf("config dir not in removed list: %v", removed)
	}
}
