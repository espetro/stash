# Manual NM round-trip checklist (F1.W3 verification)

Human-run checklist. Requires a stub native host binary (any executable that
reads length-prefixed JSON messages on stdin and writes them to stdout; see
Chrome's "Native Messaging" docs sample `host/native-messaging-example`).
Register it with the manifest generator (`lib/native-messaging/manifest.ts`)
at `io.illo.stash` for local testing.

Each item: [ ] pass / notes.

1. **Connect**
   - [ ] `NativeTransport.connect()` reaches `connected` with a registered
     host; `chrome.runtime.lastError` surfaced when the manifest is absent.
2. **Hello round-trip**
   - [ ] Send `{type:"hello", correlationId:"ext-<rand>", payload:{protocolVersion:"1.0.0", supportedRange:">=1.0.0 <2.0.0", ...}}`.
   - [ ] Receive `serverCard` with the SAME correlationId echoed verbatim and
     `protocolVersion` within `>=1.0.0 <2.0.0`.
3. **Correlated op exchange**
   - [ ] Send an `op` frame (any tool name, e.g. `stash_list` passed opaquely).
   - [ ] Receive `opResult` with matching `correlationId`.
4. **Kill the host → idempotent reconnect**
   - [ ] `kill` the stub process; transport fires `onDisconnect` once and
     reconnects after the backoff delay (new port).
   - [ ] Force a SECOND `onDisconnect` on the same dead port (call the
     listener twice); confirm only ONE reconnect is scheduled (one new port).
5. **SW cycling resilience**
   - [ ] Send an `op`, then force a service-worker cycle
     (`chrome://serviceworker-internals` → Stop, or wait ~5-6 min documented
     idle). After SW restart and reconnect, re-send with the SAME
     correlationId; the daemon answers idempotently (no duplicate side
     effects). No extension-local request state was needed.
6. **No duplicate frames after double onDisconnect**
   - [ ] Instrument `send` during the reconnect window; confirm no frame is
     posted twice and nothing is posted to a dead port (no throw).
7. **Error shape**
   - [ ] Stub replies with an `error` frame `{code, message, details?}`;
     `onFrame` receives it intact.

Record results in the F1 issue (espetro/stash#46).
