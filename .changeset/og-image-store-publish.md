---
"stash-viewer": patch
---

feat(viewer): branded og-image + Open Graph/Twitter card meta

`public/og.png` (product-mock variant: wordmark, headline, mini Shared
Tabs card) rendered from the checked-in `og-card.html` recipe — same
approach as calca's landing. `Layout.astro` and `ViewerLayout.astro` now
emit `og:*`/`twitter:*` tags (summary_large_image) so link previews show
the card on every landing and `/s` page.
