# Share link unreachable from Spain during football windows (2026-08-29)

## Correction (this file was previously misleading)

An earlier version of this note ranked "edge/origin down" as the most likely
cause and half-blamed the agent sandbox. Both are wrong. It was renamed from
`2026-08-29-share-link-unreachable-from-agent-sandbox.md` because the
"from-agent-sandbox" framing is what pointed the diagnosis in the wrong
direction.

## Symptom

An agent (research mode, resumed session) could not fetch a stash share link:

    https://stash.illo.fyi/s/#p=CGzkCIKwOeCryso...

Three independent clients failed identically:

| Method | Result |
|---|---|
| `crw` scrape (HTTP + JS renderer fallback) | "Target unreachable: Could not reach https://stash.illo.fyi..." |
| `webfetch` (Exa) | request timeout |
| `curl -v` direct | TCP connect timeout on :443 |

`https://isitagentready.com/` also reported a low score at the time.

## Confirmed cause

**Spanish ISPs null-route Cloudflare IP ranges during football match windows**,
under LaLiga's court-ordered anti-piracy blocks. stash is hosted entirely on
Cloudflare (Pages for the viewer, Workers for the shortener), so during the
season a large share of Spanish users, including the maintainer, periodically
cannot reach any stash surface at all.

The evidence in this note is the signature of exactly that, and rules out every
other candidate:

- DNS resolves correctly: `stash.illo.fyi` -> Cloudflare edge IPs
  (`188.114.96.5` / `188.114.97.5`), same records as apex `illo.fyi`.
- IPv6: "no route to host" on `2a06:98c1:3121::5` / `::5`.
- IPv4: SYN sent, no answer -> connection timeout. Not an HTTP error, not TLS,
  not DNS. The edge never accepts the TCP connection.

That is a null route upstream of Cloudflare. It is not an origin outage, not a
WAF rule, not the agent sandbox (`nono` reported "net outbound allowed" and the
same failure hit `webfetch`, which runs outside the sandbox). It reproduces on
a schedule (match windows), which is why a probe run outside one shows green:
`https://stash.illo.fyi/stashes/` returned HTTP 200 in 0.49s and `/llms.txt`
returned 200 when checked on 2026-08-29, consistent with commit 8a56726's 20/20
probe on 2026-08-25. The origin was up the whole time.

## Durable finding (unchanged, still true)

Share links (`/s/#p=...`) decrypt client-side from the URL fragment, so even
when the edge is reachable, plain HTTP scrapers get an empty shell. A real
browser (camofox skill) is required to render and extract stash contents.
`apps/viewer/functions/s.ts` partially closes this for received links via
server-side fragment decode with content negotiation when the payload arrives
as `?p=` rather than `#p=`.

## Impact and follow-ups

"The whole product is on Cloudflare" is a single point of failure with a
recurring, scheduled outage for an entire country. Mitigations, cheapest first:

- **Local decode, no network.** A locally served viewer shell (from the planned
  daemon, on loopback) decodes a pasted `/s/#p=...` link with zero egress.
  `VITE_VIEWER_ORIGIN` and the existing self-hosted-viewer support mean the
  plumbing is partly there. Covers reading, both own and received links. Does
  not cover short links (a network round trip by definition).
- **Non-Cloudflare mirror origin.** A second hostname on a different provider,
  with the extension and daemon failing over when the primary is unreachable.
  `packages/server-core` is already runtime-agnostic over `unstorage`, so the
  shortener half is the cheaper one to port; `apps/viewer/functions/` is
  Cloudflare Pages Functions specific and needs a portable equivalent.

The earlier "ask Cloudflare to challenge instead of silently drop" follow-up is
retired: the drop is not Cloudflare's, it is upstream of it.

These are tracked in the local-first re-platform spec
(`.agents/plans/2026-08-29-local-first-replatform-spec.md`, section 9a) and its
follow-up issues.
