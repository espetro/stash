---
"@stash/extension": patch
"stash-viewer": patch
---

feat(brand): new stash mark across extension, viewer, and og card

Swaps the blue-doc icon for the new mark (red accent variant). Extension
`icon-{16,48,128}` PNGs regenerated from the trimmed 2048px source and
the embedded-raster `icon-*.svg` files replaced with the real vector.
Viewer `icon-{48,128}` (navbar logo, favicon, apple-touch-icon) updated
and `favicon.svg` added so the docs pages' `/favicon.svg` link resolves.
og-card variant C now shows mark + wordmark; `og.png` re-rendered via
Playwright CDP (`chrome --screenshot` clips bottom-anchored elements on
Chrome for Testing — recipe comment updated). Sources + size ladder
(16-512px, both colorways) kept in `assets/brand/`.
