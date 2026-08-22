# Agent URL extraction (PR1 of plan resolved-allowing-drum)

Five bundled viewer/shortener changes to make every Stash URL readable
by any agent class without configuration:

1. **Fix `<link rel="alternate">` in `apps/viewer/src/layouts/ViewerLayout.astro`** — SSR
   emits `/json?p=` and `/md?p=` (no fragment, no `?format=…`); the
   `useDecodeShareUrl` hook fills in the encoded payload client-side.
2. **Extend `apps/viewer/public/llms.txt`** — add URL → JSON → MD worked
   example, document shortener `/s/<id>[.json|.md]` endpoints, document
   `Accept: application/json` content negotiation.
3. **Extend OpenAPI spec** — extracted builder to
   `apps/viewer/src/lib/openapi-spec.ts` and re-exported via the slim
   `pages/api/openapi.json.ts` route. New paths: `/api/stash` (POST),
   `/s/{id}`, `/s/{id}.json`, `/s/{id}.md` under `s.illo.fyi` server;
   added `text/plain` content negotiation, `StashCreated` schema.
   Structural test in `apps/viewer/src/__tests__/openapi.test.ts`.
4. **`Accept: text/plain` content negotiation** — added in both
   `apps/viewer/functions/s.ts` (with `.txt` suffix on `?p=`) and
   `packages/server-core/src/routes.ts` (with `.txt` suffix on
   `/s/<id>.txt`); new `renderPlainUrlList` helper exported from
   `@stash/server-core`. Tests added.
5. **"Copy as agent URL" button in ShareDrawer** — copies
   `<origin>/s?p=<encoded>` (query form) instead of the fragment form.
   New test in `apps/viewer/src/__tests__/ShareDrawer.test.tsx`.

## Gotchas

- `pages/api/openapi.json.ts` is excluded from `tsc` (Astro convention).
  The spec builder therefore lives in `src/lib/openapi-spec.ts` so unit
  tests can import it. The route file is a 6-line wrapper.
- `useDecodeShareUrl` hook comment says "The current code in that hook
  already does this correctly" — that was true; the only SSR-side bug
  was the `?format=json` path the layout emitted.
- `apps/viewer` had no React component tests. Added
  `@testing-library/react@^16.3.2` + `happy-dom@^20.9.0` as devDeps.
  The `ShareDrawer.test.tsx` opts into happy-dom via per-file pragma
  (`// @vitest-environment happy-dom`) so the global default stays
  node — keeping `agent-fetch.test.ts` happy.
- `happy-dom`'s `navigator.clipboard` is a getter-only property.
  Tests stub it via `Object.defineProperty(navigator, 'clipboard', …)`
  rather than `Object.assign` (which threw "Cannot set property clipboard").
- Server-core `DecodedPayload.items` are objects
  (`{url, title, kind?}`), not tuples, after decoding via
  `decodePayload`. `renderPlainUrlList` uses object destructuring.
- `TelemetryRoute` union needed `"s_view_txt"` added — TS caught the
  missing variant the moment the route returned the format.
