# Google OAuth brand verification prep

Date: 2026-10-07
Issue: (linked in PR)

## Context

The maintainer's GCP OAuth app ("Stash Release Publisher") needs Google brand
verification so CI can publish extension builds to the Chrome Web Store
(`chromewebstore` is a sensitive scope; Testing-mode refresh tokens expire in
7 days, so the app must go to production → verification required).

Google's findings and what we control:

| Finding | Owner | Fix |
|---|---|---|
| Root domain `illo.fyi` not verified | Quim | Search Console domain property + DNS TXT |
| App name ≠ homepage brand | Quim | Rename OAuth app to `Stash` |
| Homepage not obviously descriptive | This repo | `/` is already public (200, no auth wall); add `<meta name="description">` |
| Privacy policy too thin | This repo | Expand `/privacy` into a formal policy |

## Changes

1. `Layout.astro`: optional `description` prop → `<meta name="description">`.
2. `en.json`: `meta.description` key (other locales fall back to en).
3. Landing `index.astro` (en/es/fr/ru): pass localized description.
4. `privacy.astro`: keep the badge checklist as the summary, add formal
   sections — controller/contact, data categories (site, extension, tab
   payloads, relay short links), PostHog analytics, maintainer-only Google
   OAuth + Chrome Web Store API usage, native messaging, retention/deletion,
   no sale/ads, user choices, changes, contact, effective date.
5. `screen-viewer-7.md` ASCII registry update.

## Out of scope (Quim, console-side)

Search Console domain verification, OAuth rename, authorized domains, 24h
wait, retry — documented in the PR body.
