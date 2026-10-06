---
"@stash/daemon": patch
"@stash/extension": patch
---

fix(daemon,extension): make Chrome native-messaging pairing actually work

- daemon: detect the `chrome-extension://<id>/` spawn argument before flag
  parsing — Chrome always launches the host with the origin as argv, and the
  previous dispatch exited `unknown command` on every real spawn.
- daemon: natmsg codec now speaks the Chrome NM wire format (4-byte
  little-endian length prefix + JSON) instead of newline-delimited JSON.
- extension: `postMessage` the frame object instead of its JSON string —
  Chrome delivers strings verbatim to the host, so the daemon saw a string
  where it expected an envelope.
