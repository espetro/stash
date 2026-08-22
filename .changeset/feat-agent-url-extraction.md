---
"stash-viewer": minor
"@stash/server-core": minor
---

Improve agent URL extraction across the viewer and shortener:

- `apps/viewer`: fix `<link rel="alternate">` tags in the layout (emit
  `/json?p=` and `/md?p=` for hook-side fill instead of the previous
  broken `?format=…`).
- `apps/viewer`: add `"Copy as agent URL"` button to `ShareDrawer`,
  copying `<origin>/s?p=<encoded>` so fetch-only agents can consume
  the same link without depending on the URL fragment.
- `apps/viewer`: extend `public/llms.txt` with a worked URL → JSON →
  MD example and the shortener's `/s/<id>[.json|.md]` surface.
- `apps/viewer`: split the OpenAPI spec builder into
  `src/lib/openapi-spec.ts` and document the shortener's `/api/stash`,
  `/s/<id>`, `/s/<id>.json`, and `/s/<id>.md` routes under the
  `s.illo.fyi` server URL.
- `apps/viewer` + `@stash/server-core`: add `Accept: text/plain`
  content negotiation to both `/s?p=<payload>` and `GET /s/<id>`
  (plus a `.txt` suffix on the shortener); text responses render a
  plain URL list, one per line.
