---
"@stash/extension": patch
"stash-viewer": patch
---

fix(brand): center stash mark in all icon assets

The viewBox wasn't centered on the path (off by ~180 units on each
axis), so every rendered icon sat bottom-right of its tile. Recomputed
the content bbox, set a square viewBox with uniform padding on both
colorways, and re-rendered the full PNG ladder + og.png.
