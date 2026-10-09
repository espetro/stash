---
"stash-viewer": patch
---

Rename landing icon PNGs with a `-v2` suffix to evict stale year-immutable edge cache, and drop root `*.png`/`*.jpg` cache headers to 1 day so future asset updates propagate.
