package store

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
)

func openTest(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "stash.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestWALAndMigrations(t *testing.T) {
	s := openTest(t)
	var mode string
	if err := s.DB().QueryRow(`PRAGMA journal_mode`).Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if mode != "wal" {
		t.Fatalf("journal_mode = %s, want wal", mode)
	}
	v, err := s.CurrentVersion()
	if err != nil || v < 1 {
		t.Fatalf("migration version = %d, %v", v, err)
	}
}

func TestPutGetSearchDelete(t *testing.T) {
	s := openTest(t)
	rec := Record{ID: "abc123", Title: "GitHub", URL: "https://github.com", ItemsJSON: "[]", CreatedAt: 1, UpdatedAt: 2, CRDTSeq: 1}
	if err := s.PutRecord(rec, []byte("blob1"), "peer1", "create"); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetRecord("abc123")
	if err != nil || got == nil || got.Title != "GitHub" {
		t.Fatalf("get: %+v %v", got, err)
	}
	blob, _, err := s.CRDTDoc()
	if err != nil || string(blob) != "blob1" {
		t.Fatalf("crdt blob: %q %v", blob, err)
	}
	depth, _ := s.OutboxDepth()
	if depth != 1 {
		t.Fatalf("outbox depth = %d", depth)
	}
	res, err := s.SearchRecords("hub")
	if err != nil || len(res) != 1 {
		t.Fatalf("search: %d %v", len(res), err)
	}
	ok, err := s.DeleteRecord("abc123")
	if err != nil || !ok {
		t.Fatalf("delete: %v %v", ok, err)
	}
	got, _ = s.GetRecord("abc123")
	if got != nil {
		t.Fatal("soft-deleted record still visible")
	}
}

func TestSyncState(t *testing.T) {
	s := openTest(t)
	if err := s.UpsertSyncState(SyncPeer{PeerID: "ext-1", Status: sql.NullString{String: "active", Valid: true}}); err != nil {
		t.Fatal(err)
	}
	peers, err := s.SyncPeers()
	if err != nil || len(peers) != 1 || peers[0].PeerID != "ext-1" {
		t.Fatalf("peers: %+v %v", peers, err)
	}
}

func TestConcurrentReadsSingleWriter(t *testing.T) {
	s := openTest(t)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			rec := Record{ID: fmt.Sprintf("id-%d", i), Title: "T", URL: "https://x", ItemsJSON: "[]", CreatedAt: 1, UpdatedAt: 1, CRDTSeq: int64(i)}
			if err := s.PutRecord(rec, []byte{byte(i)}, "p", "create"); err != nil {
				t.Errorf("write %d: %v", i, err)
			}
		}(i)
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.ListRecords(); err != nil {
				t.Errorf("read: %v", err)
			}
		}()
	}
	wg.Wait()
}

func TestConfigTable(t *testing.T) {
	s := openTest(t)
	if err := s.SetConfig("relayEndpoint", "wss://r"); err != nil {
		t.Fatal(err)
	}
	v, err := s.GetConfig("relayEndpoint")
	if err != nil || v != "wss://r" {
		t.Fatalf("config: %q %v", v, err)
	}
}

func strPtr(s string) *string { return &s }
