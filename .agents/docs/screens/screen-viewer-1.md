---
screen: viewer-1
name: Landing
route: /
file: apps/viewer/src/pages/index.astro
---

```text
+--------------------------------------------------------------+
| STASH                                          nav / actions |
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
| Footer: GitHub | Privacy | Terms             theme / lang     |
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
| Footer | always | GitHub link, `/privacy`, `/terms`, theme and language controls |

## Behavior

- No telemetry on this page; purely static Astro with client-side theme
  and language widgets.
- Locale resolved from `Astro.currentLocale` with fallback to the default
  language.
