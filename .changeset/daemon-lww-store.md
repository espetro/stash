---
"@stash/daemon": minor
"@stash/extension": patch
---

Make the daemon the durable stash store: `stash_records` now holds the full
record shape (tags, note, kept, shares, unknown-field round-trip) behind a
monotonic `rev` feed, and bidirectional extension sync applies record-level
last-writer-wins with tombstones so deletes can't be resurrected by a stale
re-seed. The daemon pushes changes it sees elsewhere back to the extension
and restores the whole library into new or wiped profiles; the extension
materializes pushes under the same LWW rule and gains `unlimitedStorage` so
`storage.local` stays a viable fallback.
