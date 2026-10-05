# F14 zero-trust: the agent-first carve-out

Date: 2026-10-05. While landing the F14 rework (slices A–D per
`2026-10-04-f14-zero-trust-assessment.md`), one scope decision was made
deliberately and should not be "fixed" later without thinking it through:

**`stash_create` (relay MCP) and `POST /api/stash {"payload": ...}` stay
plaintext.** The share's contents already transit to the relay inside the
tool arguments, so encrypting at rest buys no confidentiality for this
path — but it would break `stash_get`/`?format=` read-back, the flows the
agent-first story depends on (the user's non-negotiable for merging F14).

The asymmetry is documented on every agent surface: `llms.txt`, the
OpenAPI spec, the mirror `LLMS_TXT`, `agent-server.md`, and both
AGENTS.md files state plainly that `{ciphertext}` entries are
envelope-only + client-side decrypt, while `{payload}` entries keep full
server-side decode. Extension/viewer-minted short links are encrypted
(they serve humans following a URL); MCP/self-hoster-minted links are
plaintext (they serve agents passing data). Agents that need the
self-contained form should ask for a `#p=` link, which always works.

Corollary: `GET /s/:id?format=json` on an `enc` entry returns
`{id, ciphertext, expiry, encrypted: true}` — a capable agent CAN
decrypt (key = `#<key>` fragment, AES-256-GCM, `IV||CT+tag` base64url).
`stash_get` intentionally does NOT attempt this — it has no access to
the fragment, so it fails closed with `{error: "encrypted"}`.
