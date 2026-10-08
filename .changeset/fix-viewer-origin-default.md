---
"stash-viewer": patch
---

fix(viewer): default site origin to https://stash.illo.fyi

Cloudflare Pages builds the viewer without `VITE_VIEWER_ORIGIN`, so
`Astro.site` fell back to `http://localhost:4321` and the deployed site
emitted localhost canonical links, hreflang alternates, sitemap URLs,
and `og:url`/`og:image`. Default to the production origin like
`ViewerLayout` already does; the env var still overrides.
