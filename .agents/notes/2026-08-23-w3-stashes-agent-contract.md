# 2026-08-23 — W3 browser-agent contract on /stashes

Wave 3 of the local browser-agent surface plan (see
`.agents/plans/2026-08-23-local-browser-agent-surface.md`).

## What landed

- JSON island (`#stash-local-export`, `data-stash-status="loading"→"ready"`)
  inside the page root, only canonical export surface — no URL fragments,
  per-record data-* duplicates, window globals, or page storage.
- Semantic selectors wired into the existing render tree:
  `[data-stash-root]`, `[data-stash-list]`, `[data-stash-record-id]`,
  `[data-stash-title]`, `[data-stash-item-url]` (the last one lives on
  the `<a>` in `TabListItem`).
- `?agent=json|markdown` browser-only views. Read once via a lazy
  `useState` initializer so the first render already lands in the right
  shape (no SharedCard→agent-mode flicker). Agent view mirrors
  `data-stash-status` so consumers can wait for `ready`.
- `apps/viewer/src/__tests__/stashes-island.test.tsx` (7 cases) +
  `apps/viewer/src/__tests__/stashes-xss.test.tsx` (6 cases).

## Gotchas

- XSS tests for URL filtering (`javascript:`, `data:`, full-width
  Unicode lookalikes) must use **viewer-local** seeding, not the bridge.
  The bridge contract drops records with any non-http item at the
  boundary (`toStashExport`), so a record with a `javascript:` URL never
  reaches the renderer through the extension path. The card UI's
  `safeItems` filter only gets exercised by viewer-local records.
- The agent view returns early. To re-render when the bridge resolves,
  the hook order must be stable across renders — keep all `useState` /
  `useEffect` calls above the `if (agentMode === "json")` return.
- The bridge probe is async and resolves on a microtask, so the agent
  view's first render shows the empty `viewer-local` fallback. Tests
  that want the canonical extension payload must `waitFor` the
  readiness marker before asserting on the `<pre>` content.
- `isStashExport` in `packages/shared/src/agent-export.ts` already
  enforces `http(s)` URLs on items, so the bridge path is the trust
  boundary. The renderer's `safeItems` is defense in depth, not the
  primary filter.

## Files

- `apps/viewer/src/components/MyStashes.tsx` — JSON island, agent
  views, semantic selectors, helpers (`buildIslandExport`,
  `recordToMarkdown`, `readAgentMode`).
- `apps/viewer/src/components/TabListItem.tsx` — `data-stash-item-url`
  on the outbound `<a>`.
- `apps/viewer/src/__tests__/stashes-island.test.tsx` — new.
- `apps/viewer/src/__tests__/stashes-xss.test.tsx` — new.

No changes to `apps/extension`, `packages/shared`, or `apps/shortener`.
