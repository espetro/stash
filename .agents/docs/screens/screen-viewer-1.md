---
screen: viewer-1
name: Landing
route: /
file: apps/viewer/src/pages/index.astro
---

```text
+--------------------------------------------------------------+
| [⌂ Stash] [Features | How it works | Demo | Docs] [⚙] [Install ▾] |
+--------------------------------------------------------------+
| Your tabs are your thinking.                    (visual demo)|
| Accent second headline line.                                  |
| Subheadline copy.                                             |
|                                                               |
| [Chrome icon Install for Chrome]                              |
| [Firefox icon Install for Firefox]                            |
| [ Try in browser ]  -> /s/new                                 |
| mono tagline                                                  |
+--------------------------------------------------------------+
| Problem strip                                                 |
| Features grid (FeatureCards)                                  |
| Demo section                                                  |
| Roadmap section (RoadmapCells)                                |
| Privacy section                                               |
| Final CTA                                                     |
+--------------------------------------------------------------+
| Footer: GitHub | Privacy | Terms                               |
+--------------------------------------------------------------+
```

Localized mirrors exist at `/es`, `/fr`, `/ru` rendering the same layout
with translated strings (`apps/viewer/src/i18n`).

## Elements

| Element | State | Description |
|---|---|---|
| Hero headline | always | Two lines, second in accent color; localized via `t("hero.headline.*")` |
| CTA row | always | Primary install (Chrome store), secondary install (Firefox), ghost "Try in browser" linking `/s/new` |
| Tagline | always | Mono accent line under CTAs |
| Problem / Features / Demo / Roadmap / Privacy / Final CTA | always | Composed from `apps/viewer/src/components/landing/*` |
| Footer | always | Copyright + GitHub/Privacy/Terms only (no theme/lang controls) |

## Behavior

- No telemetry on this page; purely static Astro with client-side theme
  and language widgets accessed via the navbar's Settings
  dropdown (pointing to `apps/viewer/src/components/landing/SettingsMenu.tsx`).
- The hero sits beneath a classic block navbar (`fixed top-0`, full-width
  bar): logo on the left, marketing links centered, and a Settings widget
  plus an Install dropdown (Chrome Web Store / Firefox AMO / Try in
  browser) on the right. The bar gains a border + shadow on scroll.
- Locale resolved from `Astro.currentLocale` with fallback to the default
  language.
