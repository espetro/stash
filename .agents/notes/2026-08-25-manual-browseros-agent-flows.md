# Manual BrowserOS agent-first testing: web save flow works, extension MCP is the real gap

## Web save flow (no hints) succeeds end-to-end

Prompt given to BrowserOS's built-in agent panel, with a live personal
profile (extension loaded unpacked, several tab groups plus ungrouped
tabs open, no mention of specific URLs or UI elements):

> "Save a snapshot of all the tabs i have outside of tab groups in
> stash.illo.fyi/s/new and keep it in my stashes. you can also use the
> extension"

The agent correctly enumerated open tabs, identified tab-group
membership (two groups present, "Others" and "FDE prep"), filtered to
only the 18 ungrouped tabs, navigated to `stash.illo.fyi/s/new`, typed
each `URL | Title` pair into the form, saved the stash, then clicked
"Save to My Stashes" to persist it. Titles/URLs in the final result
matched the actual open tabs with no hallucination or omission.

## But it never touched the extension, because it can't yet

The prompt explicitly offered "you can also use the extension." The
agent did not use it — not because it chose the web path over the
extension, but because there is currently no extension-side path to
choose. Confirmed same day: `apps/extension/AGENTS.md` describes a
local MCP over a Chrome runtime port (`portName: "mcp"`), but
`packages/mcp-relay/src/extensionTransport.ts` states outright the
extension-side wiring is **not implemented yet** ("Placeholder
transport"). The only working MCP today is the hosted one on
`apps/shortener` (`POST <origin>/mcp`, streamable-HTTP,
`packages/server-core/src/mcp.ts`), which only sees stashes explicitly
uploaded to KV — it has zero visibility into `browser.storage.local`
(the extension's local-first store), so it wouldn't have helped with
this prompt anyway even if wired up as a BrowserOS custom-app MCP URL.

**Implication:** the web `/s/new` + "Save to My Stashes" flow is a
solid fallback and works today without any extension-agent plumbing.
The actual gap blocking a true "agent uses the extension directly" test
is PR6 (extension-side MCP socket), not the web flow — consistent with
the same conclusion reached independently via the `/stashes?agent=json`
legibility check on 2026-08-24/25 (see
[[2026-08-24-browseros-discovery-and-openrouter]] for the harness/profile
side of BrowserOS testing).
