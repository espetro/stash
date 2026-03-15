Looking at your logo and the four reference sites you've curated, I have a very clear picture of your brand's territory: **precise, private, intelligent infrastructure for power users.** The references span canvas-based AI tools (Fuser), minimal dev file management (Shuttle), bold developer marketing (Tailscale), and confident SaaS design (Ada). The thread connecting them is **clean grotesque typography, purposeful white space, and one strong accent against neutral surfaces.** Here's the full system. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/images/47655076/073efd18-2c47-4c1a-8bb3-fb86ddbff237/logo.jpg)

---

## Brand Positioning, Translated

Before specs: Stash lives at the intersection of **local-first infrastructure** and **curatorial intelligence**. It's not a productivity app trying to be friendly — it's a precision tool that respects the user's mental model. The visual identity should feel like something a senior engineer _trusts_, not something they have to overlook.

Your logo already sets the right tone: clean geometry, a conceptually loaded gesture (the dog-ear fold), and a blue that reads as capable without being corporate.

---

## Color Palette

### 🌕 Light Theme

| Role           | Name              | HEX       | Rationale                                                                                                                                                                                   |
| -------------- | ----------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary        | **Tab Blue**      | `#3981F6` | Your logo color — own it fully. Clean, digital-native blue that signals intelligence without feeling like a bank or enterprise SaaS                                                         |
| Accent         | **Bookmark Gold** | `#E8A020` | Amber-gold is the semantic twin to your dog-ear concept — it means _saved, starred, flagged._ It creates the strongest possible contrast to the primary and reinforces the product metaphor |
| Background     | **Paper**         | `#F5F7FC` | Slightly cool, barely blue-tinted white. Not pure `#FFF` (too sterile) — this quiet tint creates cohesion with the primary while feeling like a clean workspace                             |
| Surface        | **Sheet**         | `#FFFFFF` | Cards, panels, popups. Pure white on `#F5F7FC` creates gentle elevation without heavy shadows                                                                                               |
| Text Primary   | **Ink**           | `#0D1117` | Near-black with a whisper of cool darkness. Avoids harsh pure black while maintaining >14:1 contrast                                                                                        |
| Text Secondary | **Slate**         | `#6B7280` | Cool gray for metadata: domain names, timestamps, tab counts                                                                                                                                |
| Border         | **Hairline**      | `#E2E5EE` | Cool-tinted light gray. Feels engineered, not generic                                                                                                                                       |

### 🌑 Dark Theme

| Role             | Name                | HEX       | Rationale                                                                                                                                                     |
| ---------------- | ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary          | **Tab Blue (Dark)** | `#5B9DF8` | Lightened version of logo blue — `#3981F6` at ~7% lightness over dark backgrounds only clears ~2.8:1; this hits **7.2:1 (AAA)** against Background            |
| Accent           | **Bookmark Gold**   | `#F5A823` | Unchanged — amber is already luminous, reads even better against dark surfaces. Badge, save indicator, highlight                                              |
| Background       | **Void**            | `#0B0E15` | Dark navy-black, not pure `#000`. The blue cast harmonizes with Primary and creates depth — your UI feels _immersed_, like a focused browser session at night |
| Surface          | **Panel**           | `#11151E` | First elevation: cards, extension popup body                                                                                                                  |
| Surface Elevated | **Float**           | `#161B28` | Dropdowns, modals, tooltips — second elevation layer                                                                                                          |
| Border           | **Seam**            | `#1E2438` | Barely-there divider. Same hue family as Background                                                                                                           |
| Text Primary     | **Ghost White**     | `#EBEEf6` | Near-white with blue tint — harmonizes with surface tones and avoids clinical pure white                                                                      |
| Text Secondary   | **Fog**             | `#8896AD` | Muted blue-gray — the slight blue prevents it reading as generic gray; feels deliberate                                                                       |

---

## Typography System

### 1. **Geist Sans** — Primary UI & All Headings

**Source:** `npm install geist` (recommended) or Google Fonts — use npm for full OpenType features [vercel](https://vercel.com/font)
**Use:** Everything from the extension popup UI labels to the landing page hero H1

This is the right call, not the safe call. Geist was designed by Vercel for exactly your audience — developers and designers who build web infrastructure. It's Swiss-inspired, tabular-numerics-ready (critical for displaying tab counts, timestamps, and link counts), and has been refined specifically for screen rendering. Your reference sites use comparable grotesques (Fuser, Shuttle, Tailscale), but Geist has more intrinsic personality than Inter while being less stylistically loaded than something like Söhne. Since you're likely building on Next.js, Geist is the default font as of Next.js 15 — zero friction. [fountn](https://fountn.design/resource/geist-font-vercel/)

**Weight hierarchy:**

- `700` — Extension popup title "Stash", marketing H1
- `600` — Section headers, button labels, navigation
- `500` — Feature labels, UI element text
- `400` — Body copy, descriptions, onboarding text

### 2. **Geist Mono** — URLs, Tab Metadata, Technical Strings

**Source:** Same package: `geist/font/mono` [npmjs](https://www.npmjs.com/package/geist?activeTab=readme)
**Use:** Domain names, URLs, tab titles in list view, timestamps, share link display

This is a deliberate UX decision, not just a stylistic one. Stash's core interaction is _about browser tabs and URLs_ — displaying that data in monospace creates a **terminal-scan aesthetic** that reinforces your "AI-ready, built for engineers" positioning. It creates a clear visual grammar: Geist Sans = interface, Geist Mono = content/data.

### 3. **Instrument Serif** — Marketing Display Only (Optional but Powerful)

**Source:** Google Fonts / Adobe Fonts — free, open source [fontpair](https://www.fontpair.co/fonts/google/instrument-serif)
**Use:** Hero pull quotes and single marketing statements on the landing page only

Set _"Your open tabs are your context"_ in Instrument Serif Italic and compare it to the same line in Geist. The serif version speaks directly to your **researchers** audience — it evokes annotation, long-form thinking, and curation. Use it for exactly one or two statements on the marketing site, then let Geist take over. The contrast creates deliberate tension: editorial intelligence wrapped in technical precision. This mirrors what Fuser does with their canvas-based product marketing. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/images/47655076/deecd21a-0474-4bb7-bcd7-65da6439d3cb/image-2.jpg)

---

## Quick Reference: Theme Tokens

```
/* Light */
--color-primary:    #3981F6;
--color-accent:     #E8A020;
--color-bg:         #F5F7FC;
--color-surface:    #FFFFFF;
--color-text:       #0D1117;
--color-text-muted: #6B7280;
--color-border:     #E2E5EE;

/* Dark */
--color-primary:    #5B9DF8;
--color-accent:     #F5A823;
--color-bg:         #0B0E15;
--color-surface:    #11151E;
--color-surface-2:  #161B28;
--color-text:       #EBEEF6;
--color-text-muted: #8896AD;
--color-border:     #1E2438;

/* Fonts */
--font-sans: 'Geist', sans-serif;
--font-mono: 'Geist Mono', monospace;
--font-display: 'Instrument Serif', serif; /* landing page only */
```

---

## One Design Principle to Lock In

Stash is a **background tool** — it lives in the browser chrome, not center-stage. The visual identity should feel like it **belongs there**: confident but undemanding, present but not decorative. Every time you're tempted to add visual complexity, ask: _would a senior engineer trust this more or less?_ If less — cut it.

## Website references

- https://www.diabrowser.com/ app showcase, appeals to each user segment
- https://www.liquid.ai/apollo simple, clear CTA,
- https://anytype.io/ calming, minimal UI, clearly-delimited features,
- https://handy.computer/ simple (1-2 sections), clear CTA, main features are cristal clear, demo first

DON'T DO THIS:

- https://altic.dev/fluid dark theme first, gradients, orange-y palette
- https://hadoseo.lovable.app/ dark theme first, very long SPA (should be 1-3 sections max)
