# Manual sync checklist (F5 verification)

Human-run checklist — requires a locally installed `stash-daemon` (F2) with
the F1 native-messaging host manifest registered at `io.illo.stash`
(`lib/native-messaging/manifest.ts`). Each item: [ ] pass / notes.
Record results in the F5 issue (espetro/stash#50).

1. **Fresh profile pairing**
   - [ ] Load the extension with no daemon installed: popup stashes view shows
     the "Daemon not connected" status line; saving/sharing still works.
   - [ ] Install + start `stash-daemon`; within the reconnect backoff the
     status line disappears (state `paired`). `sync-profile-id` appears in
     `browser.storage.local`.
2. **Seed migration (W5)**
   - [ ] Create a few stashes BEFORE first pairing; after pairing the daemon
     (`stash-daemon status`) contains those records.
   - [ ] Re-pair (restart the daemon): seed re-sent, inserts nothing new
     (idempotent by record id).
3. **Kill the daemon mid-session (W4)**
   - [ ] Kill `stash-daemon`; popup still saves/edits/deletes instantly.
   - [ ] Status line shows "Daemon offline, last seen …, changes will sync
     when it reconnects" with a pending change count.
   - [ ] Persistent failure copy names `stash-daemon doctor`.
4. **Restart the daemon**
   - [ ] Client re-pairs (idempotent re-handshake); outbox backlog flushes in
     order; status line clears.
5. **Daemon push materialization (W3)**
   - [ ] With the popup open, modify a record daemon-side (e.g. another peer);
     the popup updates without reopening (storage/message invalidation).
6. **Protocol version mismatch (mocked)**
   - [ ] Stub the daemon to report an out-of-range `protocolVersion`:
     status shows "Protocol version not supported … update one side"; no
     change/seed frames leave the extension; local reads/writes unaffected.
7. **Worker restarts (MV3)**
   - [ ] Stop the service worker (chrome://serviceworker-internals) mid-session;
     on wake it re-pairs, `sync-profile-id` is unchanged, no duplicate
     outbox entries.
8. **Regression**
   - [ ] `pnpm --filter stash-extension run test`, `pnpm run validate` and
     `pnpm run build` all pass.
