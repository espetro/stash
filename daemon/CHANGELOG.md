# @stash/daemon

## 0.2.1

### Patch Changes

- dcad132: fix(daemon,extension): make Chrome native-messaging pairing actually work
  - daemon: detect the `chrome-extension://<id>/` spawn argument before flag
    parsing — Chrome always launches the host with the origin as argv, and the
    previous dispatch exited `unknown command` on every real spawn.
  - daemon: natmsg codec now speaks the Chrome NM wire format (4-byte
    little-endian length prefix + JSON) instead of newline-delimited JSON.
  - extension: `postMessage` the frame object instead of its JSON string —
    Chrome delivers strings verbatim to the host, so the daemon saw a string
    where it expected an envelope.

- Updated dependencies [049b544]
  - stash-viewer@0.10.1

## 0.2.0

### Minor Changes

- 73d01c5: Make the daemon the durable stash store: `stash_records` now holds the full
  record shape (tags, note, kept, shares, unknown-field round-trip) behind a
  monotonic `rev` feed, and bidirectional extension sync applies record-level
  last-writer-wins with tombstones so deletes can't be resurrected by a stale
  re-seed. The daemon pushes changes it sees elsewhere back to the extension
  and restores the whole library into new or wiped profiles; the extension
  materializes pushes under the same LWW rule and gains `unlimitedStorage` so
  `storage.local` stays a viable fallback.

### Patch Changes

- Updated dependencies [e3a02fb]
- Updated dependencies [b635f89]
- Updated dependencies [ffe25f4]
- Updated dependencies [401e0ea]
- Updated dependencies [d95251f]
- Updated dependencies [049b544]
- Updated dependencies [7007184]
  - stash-viewer@0.10.0
