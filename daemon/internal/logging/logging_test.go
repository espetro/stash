package logging

import (
	"os"
	"strings"
	"testing"
)

func TestRotation(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/test.log"
	w, err := New(path, 200, 3)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 40; i++ {
		w.Info("filler message to push size over the rotation threshold quickly", map[string]any{"i": i})
	}
	// one more event so the active file has content after the last rotation
	w.Info("final", nil)
	w.Close()
	b, err := os.ReadFile(path + ".1")
	if err != nil {
		t.Fatalf("rotated file missing: %v", err)
	}
	if len(b) == 0 || !strings.HasPrefix(string(b), "{") {
		t.Fatalf("rotated file not JSON lines")
	}
	active, _ := os.ReadFile(path)
	if len(active) == 0 || !strings.Contains(string(active), "final") {
		t.Fatalf("active file should contain the last event, got %q", string(active))
	}
}
