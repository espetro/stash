---
"stash-viewer": patch
---

fix(viewer): replace dead landing nav placeholders with real links

The landing navbar showed SaaS-style entries (`Products`, `Solutions`,
`Resources`, `Developers`, `Enterprise`, `Pricing`, `Contact Sales`) where
four linked only to `#`. The nav now lists the actual destinations —
Features, How it works, Demo (page anchors) and Docs (`/docs`) — with the
unused placeholder i18n keys removed across locales.
