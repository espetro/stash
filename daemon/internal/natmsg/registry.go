package natmsg

import (
	"container/list"
	"sync"
	"time"
)

// Registry tracks attached browsers with MRU ordering (most recently active
// first). A peer flips to stale when a health ping goes unanswered.
type Registry struct {
	mu    sync.Mutex
	order *list.List // front = most recently active; values are *Peer
}

// Peer is one attached browser.
type Peer struct {
	ID       string
	Label    string
	Attached time.Time
	LastSeen time.Time
	Stale    bool
}

// NewRegistry creates an empty registry.
func NewRegistry() *Registry { return &Registry{order: list.New()} }

// Touch registers (or promotes) a peer to the MRU front.
func (r *Registry) Touch(id, label string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for e := r.order.Front(); e != nil; e = e.Next() {
		p := e.Value.(*Peer)
		if p.ID == id {
			p.LastSeen = time.Now()
			p.Stale = false
			r.order.MoveToFront(e)
			return
		}
	}
	now := time.Now()
	r.order.PushFront(&Peer{ID: id, Label: label, Attached: now, LastSeen: now})
}

// MarkStale flips a peer to stale (missed pong) so status agrees with the
// extension's "Daemon offline" state (spec 4.7).
func (r *Registry) MarkStale(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for e := r.order.Front(); e != nil; e = e.Next() {
		if p := e.Value.(*Peer); p.ID == id {
			p.Stale = true
			return
		}
	}
}

// Remove drops a peer.
func (r *Registry) Remove(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for e := r.order.Front(); e != nil; e = e.Next() {
		if p := e.Value.(*Peer); p.ID == id {
			r.order.Remove(e)
			return
		}
	}
}

// Peers returns peers in MRU order.
func (r *Registry) Peers() []Peer {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]Peer, 0, r.order.Len())
	for e := r.order.Front(); e != nil; e = e.Next() {
		p := e.Value.(*Peer)
		out = append(out, *p)
	}
	return out
}

