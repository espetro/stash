package mcpserver

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/vmihailenco/msgpack/v5"
)

// decodeFixtures loads the canonical shared fixture set
// (packages/shared/fixtures/payloads.json) for stash_decode integration
// checks. Schema: packages/shared/fixtures/payloads.md.
type fixture struct {
	Name     string `json:"name"`
	Fragment string `json:"fragment"`
}

func decodeFixtures(t *testing.T) []fixture {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "packages", "shared", "fixtures", "payloads.json"))
	if err != nil {
		t.Fatalf("shared fixture set not found: %v", err)
	}
	var fs []fixture
	if err := json.Unmarshal(b, &fs); err != nil {
		t.Fatal(err)
	}
	return fs
}

// msgpackMarshal encodes a map with string keys, matching @msgpack/msgpack.
func msgpackMarshal(v any) ([]byte, error) {
	var buf bytes.Buffer
	if err := msgpack.NewEncoder(&buf).Encode(v); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func base64RawURL(b []byte) string {
	return base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(b)
}
