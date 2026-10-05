# F14 zero-trust relay — landing assessment

Date: 2026-10-04 (UTC) · Branch assessed: `origin/feat/local-first-f14-zero-trust` (tip `0539a40`)
Base: `origin/develop` @ `b838032` (post-#65/#66/#67) · Merge-base: `8ea5469` ("test(extension): protocol version range checks")
Method: fetched both refs, read every commit diff, ran a trial `git merge` for the conflict set, then checked each auto-merged file for semantic drift.

Verdict up front: **do not rebase-and-merge as-is.** The cryptographic core and the client plumbing are solid and verified; the gaps are (a) zero-trust silently breaks the agent/machine-readable surface and F14 updates none of the agent-facing docs, (b) a back-compat landmine makes every pre-existing and old-client short link dead on deploy, and (c) the `?id=` viewer indirection regresses F13 mirror failover because the URL no longer carries which relay minted it. Recommend a rework-then-merge landing in 3 slices (§6). Estimated effort ≈ 1–1.5 days including test updates.

---

## 1. What F14 actually changes, commit by commit

The branch is **8 commits** on top of the merge-base (the "9 commits" in the task counts merge-base `8ea5469`, which is already on develop at position 67 of `git log origin/develop`).

### `92239d3` feat(shared): zero-trust relay crypto core — VERIFIED
- New `packages/shared/src/crypto.ts` (93 lines): `generateShareKey()` = 16 random bytes base64url (128-bit key), `encryptForRelay(payload, key)` / `decryptFromRelay(ct, key)` via WebCrypto `AES-GCM`, random 96-bit IV prepended to ciphertext, combined `IV || CT+tag` base64url-encoded. No KDF — key is random per share. Errors are typed strings ("Invalid share key encoding", "Ciphertext too short", "Decryption failed: wrong key or corrupted ciphertext").
- `@oslojs/encoding ^1.1.0` added to `packages/shared/package.json`; `./crypto` subpath export added; barrel `index.ts` re-exports the three functions.
- `crypto.test.ts` (55 lines): round-trip, random-IV, tamper, wrong-key, truncation — verified present.
- Opinion: correct, boring crypto. Random per-share key in the URL fragment is the right shape for this threat model; `@oslojs/encoding` is a maintained micro-dep consistent with repo conventions.

### `7001453` feat(server-core): opaque ciphertext, drop `t` — VERIFIED, with two latent defects
- `store.ts`: `StoredEntry` gains `enc?: true`, drops `t?` (closes F7.W5); `createStash(storage, p, ttl, {encrypted})` marks `enc`.
- `routes.ts` POST `/api/stash`: accepts `{ciphertext}` **or legacy `{payload}` as a ciphertext alias**; drops server-side decode validation and the `C/R/D/S` prefix check (replaced by a `^[A-Za-z0-9_-]+$` base64url check); drops `itemCount` from the response; **always** passes `encrypted: true` to `createStash`.
- `routes.ts` GET `/s/:id`: `?format=json` returns `{id, ciphertext: entry.p, expiry, encrypted: true}`; `md`/`txt` → 409 fail-closed; HTML → 302 to `${viewer}?id=${id}${url.hash}`.
- `mcp.ts`: `stash_create` encrypts with a transient key and returns `…/s/<id>#<key>`; `stash_get` returns `{error: "encrypted"}` `isError` for `enc` entries.
- Tests rewritten accordingly (legacy-alias test, opaque-storage test, 409s, envelope round-trip via `decryptFromRelay`).

Defect 1 (verified by reading the merged routes.ts): **`entry.enc` is never consulted on the HTTP read path.** `?format=json` hardcodes `encrypted: true` and serves `entry.p` as "ciphertext" even for a plaintext entry; `md`/`txt`→409 and `?id=` redirect are unconditional. Consequences:
  - Every pre-F14 KV entry (plaintext, no `enc`) mislabels as ciphertext → dead links for their remaining TTL (≤7d blast radius).
  - The `payload` alias stores *plaintext bytes* marked `enc: true` and returns `/s/<id>` **without `#key`** → old-extension uploads are dead on arrival (viewer shows "link incomplete"; a key-holder would hit GCM auth failure on plaintext).
Defect 2: `${url.hash}` in the redirect is dead code — `new URL(request.url).hash` is always `""` server-side (fragments are never sent). Harmless (browsers re-attach the original fragment when Location has none), but it signals a misunderstanding worth fixing.

### `df9ac26` chore: lockfile for `@oslojs/encoding` — VERIFIED
9-line `pnpm-lock.yaml` change; auto-merges but should be regenerated after merge.

### `96a3045` feat(extension): encrypt before relay upload — VERIFIED
- `lib/shortener.ts::createShortLink`: generates key → `encryptForRelay` → POST `{ciphertext, ttl}` → returns `${data.url}#${key}`. Failure paths still `{fallback: true}` → caller keeps the self-contained `#p=` link (fail-open to plaintext-by-design — matches spec).
- `shortenShareUrl` unchanged in contract (requires `#p=` in input). `LinkResult.tsx` hint copy updated; screen doc `screen-extension-2.md` updated in `228866a`.
- New `__tests__/shortener.test.ts` (110 lines): ciphertext-not-plaintext assertion, fragment-key shape (`[A-Za-z0-9_-]{22}`), key absent from request body — good coverage.

### `ed01874` feat(viewer): client-side decrypt, fail closed — VERIFIED
- `useDecodeShareUrl.ts`: new `?id=<id>` branch — id regex `^[A-Za-z2-7]{6}$`; missing fragment → "Link incomplete…" **with no network call** (verified); fetches `${getShortenerOrigin()}/s/<id>?format=json` (CORS is `*` in `constants.ts` — works); 404/410 → "expired or revoked"; `decryptFromRelay` → `decodeEncodedPayload` → existing expiry/format handling. Self-contained `#p=`/`?p=` path untouched.
- `lib/shortener.ts` (viewer copy) mirrors the extension's encrypt-before-upload.
- New `useDecodeShareUrl.test.tsx` (144 lines): missing key, 404/410, tampered ciphertext, happy path — verified.
- `dist-alternates.test.ts` lazy-read fix — legit test hygiene, unrelated to crypto.
- Subtlety verified: the `?id=` branch never updates `<link rel="alternate">` — relayed views get no agent alternates (they'd be meaningless anyway — see §4a).

### `22390a7` + `228866a` + `0539a40` docs/style — VERIFIED
- `content/docs/privacy-and-data.md`: "an encrypted copy … is stored on the shortener" ✔
- `content/docs/self-hosting.md`: new "Zero-trust relay storage" section — accurate: opaque KV, fragment key, TTL eviction, DELETE revocation, fail-closed md/txt + MCP, `#p=` never touches relay.
- `screen-extension-2.md` hint copy matches `LinkResult.tsx`. `0539a40` is pure formatting.

### What F14 does NOT update (verified by absence in `git diff MB..branch`)
`apps/viewer/public/llms.txt`, `apps/viewer/src/lib/openapi-spec.ts` request schema (still `required: ["payload"]`, description "C/R/D/S prefix + body"), `apps/mirror/src/index.ts` inline `LLMS_TXT`, `apps/shortener/AGENTS.md`, `packages/evals`, `packages/e2e/scripts/probe-agent-uas.ts`, any `.changeset/*`, `packages/codec`, `daemon/`.

---

## 2. Conflicts and rework vs today's develop

Trial merge (`git merge --no-commit` on develop): **4 textual conflicts**, all small; several auto-merged files are still semantically wrong.

| File | Conflict? | What develop did since MB | Resolution needed |
|---|---|---|---|
| `packages/server-core/src/routes.ts` | YES (1 hunk) | `2aba17d` added `viewerOrigin` config; redirect uses `deps.viewerOrigin` | F14's `?id=` redirect **must** use `deps.viewerOrigin` — keeping F14's `deps.origin` would redirect short links to the shortener's own `/s` (404). Also: auto-merge leaves a now-unused `decodeEncodedPayload, PayloadDecodeError` import → tscheck/lint fail. |
| `packages/server-core/__tests__/routes.test.ts` | YES | develop added "redirects to the configured viewer origin" + `?v=` override tests asserting `#p=` | Keep develop's `viewerOrigin`/`?v=` coverage but assert `?id=` Location (and document that fragments are preserved by redirect semantics, not `url.hash`). |
| `apps/extension/lib/shortener.ts` | YES (imports only) | #65 added `revokeShortLink` + `getSettings` import | Union both imports; `revokeShortLink` parses `url.pathname` (`/s/<id>`) so `…#key` URLs revoke fine — verified compatible. |
| `.agents/docs/screens/screen-extension-2.md` | YES | #66 rewrote the section (Recent/Keep bullets) | Keep develop's bullets + F14's "encrypts client-side… `/s/<id>#<key>`" annotation. |

Auto-merged but needing rework:

- **`useDecodeShareUrl.ts`** — merges cleanly (develop's `tags?`/`note?` on `DecodedData` + F14's relay branch). No rework.
- **`LinkResult.tsx` + test** — merges cleanly (#66's `isKept`/`onKeep` Keep button + F14's hint). No rework.
- **`mcp.ts` / `mcp.test.ts`** — merges cleanly (develop's new server-card `stash-extension`/`stash-daemon` entries coexist with F14's encrypting `stash_create`).
- **`shared/package.json`, `src/index.ts`, `pnpm-lock.yaml`** — trivial union merges; regenerate lockfile, add a `.changeset` (repo convention — F14 has none).
- **Fixture drift (`payloads.json`)** — NOT a blocker: regenerated twice on develop (`e70996e` + #67's conformance re-copy), but F14 doesn't touch fixtures and all its tests self-generate payloads via `encodePayloadToUrl`/`createPayload` (verified in `shortener.test.ts`, `useDecodeShareUrl.test.tsx`, `crypto.test.ts`). No re-copy needed.
- **Codec version range** — no-op: `PAYLOAD_VERSION = 6` identical on both branches (`packages/codec/src/constants.ts`); encryption wraps the payload opaquely, so no version bump is strictly required. The sync-protocol range `>=1.0.0 <2.0.0` (`lib/sync/protocol`, exercised by merge-base test `8ea5469`) is also unaffected — `ShareEvent.shortUrl` is an opaque string on the wire.
- **Daemon view of a share (#67)** — none: `stash_records.shares_json` is stored/round-tripped as opaque JSON (`daemon/internal/store/recordjson.go`, migration `0002_full_record.sql`); `daemon/internal/codec` only decodes `#p=`/`#q=` fragments for `stash_decode` and its `encoder.go` only *emits* self-contained `/s/#p=` links — it never resolves `/s/<id>` links or talks to the relay. `natmsg` pushes records wholesale. Ciphertext changes nothing in the daemon's view. The one nuance: `#key` material now rides LWW sync into durable SQLite — same exposure class as the `#p=` plaintext URLs already stored there, so acceptable, but daemon backups now contain live decryption keys (§4e).

---

## 3. Design gaps

### a) Zero-trust kills the machine-readable surface for relayed links — and nothing downstream was updated
Verified: `?format=md|txt` → 409, `?format=json` → ciphertext envelope, `stash_get` → `{error:"encrypted"}`, `GET /s/<id>` → `?id=` redirect that requires JS + fragment key. The docs F14 wrote even acknowledge this ("works only for self-contained payloads"). But the *agent-facing* surface still advertises the old contract: `llms.txt` (POST `/api/stash`, `GET /s/<id>?format=…`, `stash_get` "id → items"), `openapi-spec.ts` (`required: ["payload"]`, prefix description, `itemCount` response), mirror's inline `LLMS_TXT`, `apps/shortener/AGENTS.md`. Any agent that follows `llms.txt` after a human shares a short link will fail closed — likely hallucinating instead (the `negativeFetchOnly` eval exists precisely because this class of failure is real).
- `packages/evals`: `bootShortener`/`run.ts` POST `{payload: <plaintext>}` → lands as `enc:true` ciphertext; `shortLinkRead` hands the model a `/s/<id>` link with no key → ungradeable.
- `packages/e2e/scripts/probe-agent-uas.ts`: same plaintext POST; the "short link" check asserts only `Content-Type: application/json` — stays green on a ciphertext envelope while the payload is unreadable (green-but-meaningless).
- The Playwright E2E specs (#65 harness) never exercise the shortener — verified; unaffected.

### b) Back-compat: the transition story is a trap, not a ramp
- `payload` alias: old extensions POST plaintext → stored `enc:true`, returned URL has no `#key` → dead link. A "legacy alias" that produces dead links is worse than a clean 400 — the user sees a successful shorten that can never resolve.
- Pre-F14 KV entries: all become undecryptable-on-read (defect 1). ≤7d TTL caps the blast radius, but a single release will invalidate every in-flight short link instead of letting them age out.
- Fix is cheap and the `enc` field is already the seam for it: on the read path, `!entry.enc` → today's plaintext behavior (decode, md/txt, `#p=` redirect); `entry.enc` → envelope/409/`?id=`. And on write: treat `payload` as legacy-plaintext (validate + store `enc` unset) or reject it once the extension fleet is new — do not store it as ciphertext.

### c) `?id=` indirection regresses F13 mirror failover
Pre-F14, `GET <relay>/s/<id>` redirected to `viewer#p=<payload>` — the data traveled in the redirect, so a link minted on the mirror worked no matter which relay the viewer trusted. Post-F14, the viewer gets only `id` and fetches `${getShortenerOrigin()}/s/<id>` — a **build-time constant** (`VITE_SHORTENER_ORIGIN || https://s.illo.fyi`). A mirror-minted link (F13 failover emits mirror-origin links during a primary outage) → mirror 302 → hosted viewer `?id=` → viewer asks the *primary* → 404 → "expired or revoked". The same wrong-relay failure hits `?v=` custom viewers and multi-relay self-hosters. Smallest fix: carry the minting origin in the redirect, e.g. `${viewer}?id=${id}&relay=${deps.origin}` (or `?r=` short-form, keeping the key in the fragment as today).

### d) Encryption × Kept/Recent auto-expiry — mostly compatible, two wrinkles
Verified flow (`App.tsx`, `stash-store.ts`): share → `recordShare` (`kept:false`, `shares:[{url:#p=, expiresAt:<payload-expiry>}]`) → optional shorten → `attachShortUrl` matches on `share.url === #p=` and stores `shortUrl` (= `/s/<id>#<key>` under F14). `recentExpiresAt = min(max share.expiresAt, lastShare + 30d)`; `pruneExpiredRecent` deletes unkept records and `deleteStash` revokes `shortUrl` via `revokeShortLink` (pathname parse — works on `#key` URLs).
- Wrinkle 1: `share.expiresAt` is the *payload* expiry (up to `never` = 876000h), while the relay evicts at ≤ `maxTtl` (≤7d hosted). A Recent record's library row can outlive its ciphertext — pre-existing semantics, unchanged, but the failure mode shifts from 410 to "link incomplete"/"expired or revoked" depending on which state the entry is in.
- Wrinkle 2: Kept records retain `#key` URLs forever; after TTL the key is dead weight — same as today's dead plaintext short links.
- No "fail closed" path touches One Library: records hold local plaintext `items` + `#p=` URLs; the extension never re-fetches `/s/<id>` (verified — no `format=json` fetches in extension code).

### e) Keys in durable stores — acceptable, worth one doc line
`shortUrl` with `#key` lands in `storage.local`, syncs via `natmsg`/LWW into `stash_records.shares_json`, and is included in `exportStashesToJSON` backups. This is the same exposure as the `#p=` plaintext URLs already stored alongside — the zero-trust boundary is the relay, not the user's own machines — but "the daemon DB contains live relay keys" deserves one line in the sync/daemon docs.

### f) Minor hardening notes (optional)
- No AAD binding of ciphertext to the stash `id` — a malicious relay could swap two entries' ciphertexts (GCM still fails closed client-side, so impact is a wrong-stash DoS equal to today's plaintext swap). Binding `id` as AAD is a small improvement, optional.
- POST no longer validates payload structure — by design (can't see inside). Cost: undecryptable garbage uploads produce dead links and can't be distinguished from valid ciphertext in telemetry/debugging.
- Benefit worth keeping on the record: `#key` short links are ~40 chars vs `#p=` up to 8000 — the QR path gets dramatically more reliable (the "URL too large for QR" fallback effectively disappears for shortened links).

---

## 4. Risk assessment

| Risk | Severity | Note |
|---|---|---|
| Old-extension short links dead on arrival via `payload` alias | **High** | Silent fail: upload 201s, link never resolves. Worst failure mode — looks successful. |
| All pre-F14 short links break at deploy (≤7d window) | Medium | TTL caps it; grandfathering via `enc` read-gate removes it entirely. |
| Agent surface advertised but dead (`llms.txt`, OpenAPI, mirror card, `stash_get`) | **High** | Docs actively mislead; `llms.txt` is the canonical agent contract for this project. |
| F13 failover regression: mirror-minted links 404 | Medium-High | Only during primary outage, but that's exactly when failover matters. |
| Evals + UA probe rot | Medium | `shortLinkRead` ungradeable; probe green-but-empty. |
| Merge artifacts (unused import, `deps.origin` resolution, routes.test rewrite) | Low | Mechanical, caught by `pnpm run validate` + tests. |
| Crypto correctness | Low | Verified sound; WebCrypto AES-GCM; tests cover tamper/wrong-key/truncation. |
| Kept/Recent + daemon sync interplay | Low | Verified compatible; `#key` in durable stores is acceptable-by-design. |

## 5. Recommendation

**Rework specific parts first, then land — do not rebase-and-merge as-is.** The crypto and client layers are merge-quality today; the server-side transition story and the agent surface are not. Deferring further is *not* recommended either: the branch is only 8 commits, the overlap surface is understood, and every week of drift adds merge cost on exactly the files that moved most (#66/#67 rewrote the same share/record paths F14 touches).

Required rework before merge, in order of importance:
1. Back-compat via the `enc` seam: read path gates on `entry.enc` (plaintext entries → legacy decode/md/txt/`#p=` redirect); `payload` alias stores legacy-plaintext (or 400s) — never `enc:true` plaintext.
2. `?id=` carries the minting relay (`&relay=`/`?r=`) so mirror-minted and `?v=` links resolve.
3. `deps.viewerOrigin` in the redirect + drop the dead `${url.hash}` + drop the unused codec imports.
4. Agent-surface reconciliation: `llms.txt`, `openapi-spec.ts` (`ciphertext` field, envelope schema, 409 semantics, no `itemCount`), mirror `LLMS_TXT`, `apps/shortener/AGENTS.md`; rework `evals` `shortLinkRead` (either POST a real ciphertext + teach the eval the key-in-prompt path, or keep a plaintext fixture path via the `enc` gate) and the UA probe (assert decryptable envelope or switch to `enc`-gated plaintext).
5. `.changeset` + regenerate `pnpm-lock.yaml`.

Effort estimate: rebase + conflict resolution ~2–4h; items 1–2 ~half a day (small, well-seamed changes + tests); items 3–5 ~half a day (docs sweep + eval/probe rework). **Total ≈ 1–1.5 days** in one session. Alternative "merge as-is" is ~1h mechanical + knowingly shipping a broken transition and a lying agent surface — not worth it.

## 6. Suggested PR ordering — smallest viable landing sequence

1. **PR A — `feat(shared)` crypto core only.** Cherry-pick `92239d3` (+ lockfile). Zero behavioral change, unblocks everything else. ~30 min.
2. **PR B — `feat(server-core)` dual-mode relay.** `7001453` reworked: ciphertext POST + `enc` marker + **enc-gated read path** (legacy plaintext still decodes/renders/redirects; encrypted → envelope/409/`?id=` + `&relay=`), `viewerOrigin` redirect, `t` drop, MCP encrypted `stash_create`/`stash_get` fail-closed, full test rewrite incl. develop's `viewerOrigin` cases. Deployable alone: old clients keep working.
3. **PR C — `feat(extension)` + `feat(viewer)` client flip.** `96a3045` + `ed01874` (+ `228866a`, `0539a40`): encrypt-before-upload, `?id=` decrypt hook, hint copy, screens doc. Requires B deployed; still fails open to `#p=` on any relay error.
4. **PR D — agent-surface + docs reconciliation.** `llms.txt`, `openapi-spec`, mirror card, `AGENTS.md`, `content/docs` (`22390a7`), evals/probe rework, `.changeset`, plus optional AAD binding.

If speed matters, B+C can fold into one PR once the `enc` read-gate exists; keep A separate regardless — it's the only piece with zero review risk.

---

## Appendix — verification ledger

Verified by direct code read (this session):
- Crypto implementation details (`packages/shared/src/crypto.ts` @ `92239d3`).
- `enc` never read on HTTP GET path; hardcoded `encrypted: true` envelope (`routes.ts` @ `7001453`, lines ~208-235 of branch file).
- `payload` alias stores plaintext as `enc:true` (`routes.ts` POST block @ `7001453`).
- `new URL(request.url).hash` always empty server-side (redirect code @ `7001453`).
- Missing-key path makes no network call (`useDecodeShareUrl.ts` @ `ed01874`).
- Merge conflict set = 4 files; unused codec imports in merged `routes.ts` (trial merge this session).
- `viewerOrigin` is post-merge-base (`2aba17d`); F14 redirect uses `deps.origin`.
- Daemon stores `shares_json` opaquely (`recordjson.go`, `0002_full_record.sql`); daemon codec is `#p=`/`#q=` only; daemon never resolves `/s/<id>`.
- `revokeShortLink` works on `#key` URLs (pathname parse, `lib/shortener.ts` @ develop).
- `share.expiresAt` = payload expiry, not relay TTL (`App.tsx` L86).
- F14 tests self-generate payloads; no `payloads.json` dependency.
- Agent docs (`llms.txt`, openapi `required:["payload"]`, mirror `LLMS_TXT`, `AGENTS.md`) unchanged by F14.
- `evals` and `probe-agent-uas.ts` POST plaintext `payload`.
- CORS `*` on `/s/<id>` responses (`constants.ts` both branches).
- Playwright e2e specs don't exercise the shortener.

Inference / judgment (not direct observation):
- Effort estimates (§5) are calibrated guesses.
- The `&relay=` parameter is my proposed fix, not a decision F14 or develop made.
- "Green-but-meaningless" probe assessment assumes the probe won't assert decryptability — verified it only checks Content-Type.
- Kept-record dead-key equivalence to today's dead plaintext links is a judgment call on UX impact.

Not verified (out of scope): live KV contents on the hosted relay; whether old-extension fleet still posts `payload` in meaningful volume; F14 plan doc `.agents/plans/2026-08-30-zero-trust-hybrid-encryption.md` is referenced in `.agents/notes/2026-08-30-waves34-batch-pushed-review-gate.md` but never committed to either branch.
