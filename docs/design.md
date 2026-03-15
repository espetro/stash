<role>
You are an expert frontend engineer, UI/UX designer, and product marketing specialist. Your goal is to design and implement a landing page for **Stash** — a browser extension that lets users save and share their entire browser context as one link, privately and locally, with no account and no cloud.

Before writing any code, internalize the following:

- The target audience is senior engineers, researchers, and power users. Every design decision should make this person trust the tool more, not less.
- The product is a background tool — it lives in the browser chrome. The landing page should feel like it _belongs_ in that world: confident, undemanding, and precise.
- Stash is NOT a productivity app trying to be friendly. It is precision infrastructure.

Understand the full design system and brand voice below before proposing or writing anything.
</role>

---

<anti-patterns>
## What This Page Must NOT Look Like

The current site is a failure state. Avoid all of the following:

- Generic SaaS landing page templates (hero image + 3-column feature grid + testimonials)
- Pastel or overly "friendly" color usage
- Heavy shadows, gradients, or decorative illustrations
- Comic-book or cartoon-style visuals
- Rounded pill buttons and soft UI
- Marketing copy that sounds like a startup pitch deck
- Cluttered layouts with too many competing elements
- Anything that looks like it was built with a website builder

## Reference Aesthetic (Study These Carefully)

Design with the visual intelligence of these four sites:

- **Zed** (zed.dev) — clean split-pane hero with product in context, bold sans-serif, muted neutral background, feature cards with icons, confident spacing
- **Cursor** (cursor.com) — dark accent sections, real product screenshots, trusted-by logo strip, agentic/technical copy tone, strong CTA hierarchy
- **Slashy** (slashy.com) — massive bold headline, single focused CTA, product screenshot as hero art, extreme typographic clarity
- **Scratch** (ericli.io/scratch) — minimalist, macOS-native feel, clean type, barely-there UI chrome, self-evident product communication

The thread connecting all four: **grotesque type, purposeful whitespace, a single strong accent color, real product UI as the visual hero, copy that respects the reader's intelligence.**
</anti-patterns>

---

<brand-system>
## Stash — Brand & Design System

### Brand Positioning

Stash lives at the intersection of **local-first infrastructure** and **curatorial intelligence**. It's not a product you decorate — it's a product you trust. The visual identity must feel like something a senior engineer reaches for without thinking twice.

The logo is a clean geometric dog-ear fold — it signals _saved, curated, flagged_. The blue is its own: digital-native, capable, not corporate.

---

### Color Palette

#### Light Theme (Primary)

| Role           | Name          | HEX       |
| -------------- | ------------- | --------- |
| Primary        | Tab Blue      | `#3981F6` |
| Accent         | Bookmark Gold | `#E8A020` |
| Background     | Paper         | `#F5F7FC` |
| Surface        | Sheet         | `#FFFFFF` |
| Text Primary   | Ink           | `#0D1117` |
| Text Secondary | Slate         | `#6B7280` |
| Border         | Hairline      | `#E2E5EE` |

#### Dark Theme (for inverted sections and dark-mode)

| Role             | Name          | HEX       |
| ---------------- | ------------- | --------- |
| Primary          | Tab Blue Dark | `#5B9DF8` |
| Accent           | Bookmark Gold | `#F5A823` |
| Background       | Void          | `#0B0E15` |
| Surface          | Panel         | `#11151E` |
| Surface Elevated | Float         | `#161B28` |
| Border           | Seam          | `#1E2438` |
| Text Primary     | Ghost White   | `#EBEEF6` |
| Text Secondary   | Fog           | `#8896AD` |

**Rules:**

- Primary blue is used sparingly — CTAs, active states, key interactive elements.
- Gold accent is used even more sparingly — save/bookmark metaphors, a single badge, one highlight moment.
- Never use both primary and accent in the same visual cluster.
- The background is Paper (`#F5F7FC`), not white. Cards and surfaces are White (`#FFFFFF`) — this creates quiet layering without heavy shadows.

---

### Typography

**Font Stack:**

- **`Geist Sans`** — All UI, all headings, all body. Import via `npm install geist`. Default in Next.js 15.
- **`Geist Mono`** — URLs, tab counts, domain strings, metadata, share link displays. This is a UX decision: monospace = data/content, Geist = interface.
- **`Instrument Serif` (italic)** — One or two hero marketing statements on the landing page only. Use for the emotional pull quote moment.

**Weight Hierarchy:**

- `700` — H1, main hero headline
- `600` — Section headers, nav items, button labels
- `500` — Feature labels, UI metadata
- `400` — Body copy, descriptions

**Type Scale:**

- Hero H1: `clamp(2.5rem, 6vw, 4.5rem)` — Bold, tight tracking (`-0.03em`)
- Section H2: `1.875rem` (30px) — Semibold
- Feature label: `0.8125rem` (13px) — Mono or uppercase Geist 500, `tracking-widest`
- Body: `1rem` / `1.0625rem` — `leading-relaxed`
- Caption/metadata: `0.875rem` Slate — Geist Mono where it's data

---

### Spacing & Borders

- Section vertical padding: `py-20 md:py-28 lg:py-36`
- Max content width: `max-w-6xl` with `px-6 md:px-8 lg:px-12`
- Border radius: `rounded-lg` (8px) for cards and inputs — modern but not bubbly. `rounded-xl` max.
- Borders: `1px solid #E2E5EE` (light) — hairline, engineered feel
- Dividers between sections: subtle `border-t border-[#E2E5EE]` or just generous spacing — no heavy rules

---

### Shadows & Elevation

Use shadows minimally and purposefully:

- Cards on Paper background: `shadow-sm` (`0 1px 3px rgba(0,0,0,0.07)`)
- Product screenshot / hero mockup: `shadow-2xl` + subtle ring — make it feel like a floating window
- No colored shadows, no glow effects

---

### Component Patterns

**Primary CTA Button:**

- Background: `#3981F6`
- Text: White, Geist 600
- Padding: `px-5 py-2.5`
- Radius: `rounded-lg`
- Hover: Slightly darker blue (`#2563EB`), no border
- Include browser icon (Chrome/Firefox) inline where relevant

**Secondary Button:**

- Background: White, border: `1px solid #E2E5EE`
- Text: Ink (`#0D1117`), Geist 500
- Hover: border darkens to `#C0C8D8`

**Feature Cards:**

- White surface on Paper background
- `border border-[#E2E5EE]` + `shadow-sm`
- Icon: 20px, Tab Blue, thin stroke
- Label: Geist Mono 12px uppercase, Slate color
- Hover: border lightens to blue tint (`#DDEAFD`), subtle transition 150ms

**Nav:**

- Transparent on scroll start, White + hairline border when scrolled
- Logo left, links center-right, CTA button far right
- Links: Geist 500, Ink color, hover underline fade-in

**Code/URL strings:** Always `font-mono text-sm text-[#6B7280] bg-[#F0F2F8] px-2 py-0.5 rounded`

---

### Motion

- Transitions: `duration-150 ease-out` for interactive states (hover, focus)
- Scroll reveals: Subtle `opacity-0 → opacity-100` + `translateY(8px) → 0` — staggered, 300ms, only on feature section
- No bouncy animations, no parallax, no loading spinners

</brand-system>

---

<page-architecture>
## Landing Page Structure

Build the landing page as a single `page.tsx` in Next.js (App Router). Use Tailwind CSS and shadcn/ui as the base. Every section below must be implemented.

---

### 1. Navigation

- Logo (SVG inline, dog-ear icon + "Stash" wordmark in Geist 600)
- Links: Features, Roadmap, Demo
- CTA: "Add to Chrome" button (primary blue, small, with Chrome icon)
- Behavior: sticky, transparent → solid with shadow on scroll

---

### 2. Hero Section

**Layout:** Two-column on desktop (60/40 split). Text left, product mockup right. Stack on mobile.

**Headline (H1, Geist 700):**

> "Your tabs are your thinking."
> "Stop losing them."

- First line: large, tight, Ink color
- Second line: same size, Tab Blue — this is the emotional hook

**Subheadline:**

> Share your entire browser context as one link — or save it for later. Locally. Privately. No account. No cloud. No noise.

- Geist 400, `text-lg`, Slate color, `max-w-md`, `leading-relaxed`

**CTAs (inline row):**

- Primary: "Add to Chrome" (blue button, Chrome icon)
- Secondary: "Add to Firefox" (outline button, Firefox icon)
- Below CTAs: `text-xs text-slate-400 font-mono` — "Free · No account required · Works offline"

**Hero Visual (right column):**

- Browser mockup (macOS-style window chrome with red/yellow/green dots)
- Show the Stash extension popup UI with 3-4 tabs stacked, domain names in Geist Mono, a "Stash tabs →" button in Tab Blue
- Apply `shadow-2xl` and a `ring-1 ring-black/5` to make it float
- Subtle animated cursor blinking on the URL field (optional, CSS only)

---

### 3. Social Proof Strip

Thin strip, Paper background, centered:

- "Used by engineers at" + 4–5 company name mentions in Geist Mono Slate (or logo marks if available)
- Thin hairline borders top and bottom

---

### 4. Features Section

**Header:** H2 "Everything you need. Nothing you don't."
**Layout:** 3-column grid on desktop, 1-column on mobile
**6 features:**

1. **One-link context sharing** — Share all open tabs as a single URL. Teammates open it, they see your exact session.
2. **Local-first. Always.** — Your data never leaves your machine unless you choose to share. No account. No sync server.
3. **AI-ready context** — Export your current session as structured context for any LLM. Paste your tabs directly into your workflow.
4. **Works offline** — Save sessions even without internet. Read them back anytime.
5. **Named sessions** — Organize tab groups with names and timestamps. Your context, labeled.
6. **Instant restore** — Open an entire saved session in one click. Exactly where you left off.

Each card:

- White surface, `border border-[#E2E5EE]`, `rounded-xl`, `p-6`
- Icon: Lucide, 20px, Tab Blue (`#3981F6`), `strokeWidth={1.5}`
- Feature label: Geist Mono 11px uppercase, Slate, `mb-1`
- Title: Geist 600, Ink, `text-lg`, `mb-2`
- Body: Geist 400, Slate, `text-sm`, `leading-relaxed`
- Hover: border color transitions to `#BFCFFD` (blue-tinted), 150ms

---

### 5. How It Works

**Header:** H2 "Three steps."
**Layout:** Horizontal 3-step flow on desktop, vertical on mobile

**Steps:**

1. **Open Stash** — Click the extension icon while browsing. Your current tabs appear instantly.
2. **Save or share** — Hit "Save session" to store locally, or "Copy link" to share your exact context.
3. **Restore anytime** — Open any saved session with one click. Tabs reopen exactly as you left them.

Each step:

- Large step number in Geist Mono 600, Tab Blue, `text-4xl`
- Thin connecting line between steps (desktop only): `1px solid #E2E5EE`
- Title: Geist 600
- Description: Geist 400, Slate

---

### 6. Product Screenshot / Demo Section

**Full-width section, dark background (`#0B0E15`):**

- Headline in Ghost White: _"See it in action"_
- Large product screenshot showing a real saved session with multiple tabs
- Monospace tab URLs visible in the UI — this is the "trust moment"
- Optional: "Watch demo →" link in Tab Blue
- Apply noise texture overlay on dark bg: subtle `opacity-[0.02]` SVG filter

---

### 7. Privacy Statement

**Layout:** Two-column, Paper background

- Left: H2 "Built for trust."
- Right: 4 bullet points in Geist 400 Ink, each with a checkmark icon in Tab Blue

Points:

- No account required. Never.
- All sessions stored in your browser's local storage.
- Sharing is opt-in. Nothing leaves without your action.
- Open source. Audit it yourself.

Include a link to the GitHub repo in Geist Mono below the bullets.

---

### 8. Final CTA Section

**Dark background (`#0B0E15`), centered, generous padding (`py-32`):**

- Small label above headline: Geist Mono 12px uppercase Fog — "Free browser extension"
- H2 in Ghost White: "Stop losing your context."
- Sub: Geist 400 Fog — "Add Stash to your browser in 30 seconds."
- Two buttons: "Add to Chrome" (blue filled) + "Add to Firefox" (outline white)
- Below: "No account · No cloud · Works offline" in Geist Mono 12px Fog

---

### 9. Footer

- Logo + tagline: "Your tabs are your thinking."
- Three columns: Product (Features, Roadmap, Demo), Resources (Docs, GitHub, Changelog), Legal (Privacy, Terms)
- All links: Geist 400, Slate, hover: Ink
- Bottom bar: copyright in Geist Mono 12px Slate + "Made with care for power users."

</page-architecture>

---

<implementation-rules>
## Technical Implementation

**Stack:**

- Next.js 15 App Router
- Tailwind CSS v4
- shadcn/ui for base components (Button, Badge)
- Geist font via `next/font/local` or `geist` npm package
- Lucide React for icons
- `framer-motion` for scroll-reveal animation (feature section only, keep it subtle)

**CSS Token Setup (globals.css):**

````css
:root {
  --color-primary:    #3981F6;
  --color-accent:     #E8A020;
  --color-bg:         #F5F7FC;
  --color-surface:    #FFFFFF;
  --color-text:       #0D1117;
  --color-text-muted: #6B7280;
  --color-border:     #E2E5EE;

  --font-sans: 'Geist', sans-serif;
  --font-mono: 'Geist Mono', monospace;
  --font-display: 'Instrument Serif', serif;
}

.dark {
  --color-primary:    #5B9DF8;
  --color-accent:     #F5A823;
  --color-bg:         #0B0E15;
  --color-surface:    #11151E;
  --color-text:       #EBEEF6;
  --color-text-muted: #8896AD;
  --color-border:     #1E2438;
}

File Structure:

```text
app/
  page.tsx           ← Main landing page
  layout.tsx         ← Font setup + metadata
components/
  landing/
    Hero.tsx
    Features.tsx
    HowItWorks.tsx
    DemoSection.tsx
    PrivacySection.tsx
    FinalCTA.tsx
    Footer.tsx
    Nav.tsx
````

Accessibility:

- All interactive elements: focus-visible:ring-2 focus-visible:ring-[#3981F6] focus-visible:ring-offset-2
- Alt text on all images/mockups
- Skip-to-content link at top
- Min touch target: 44px × 44px

Quality Check Before Finishing:

- Does every section reflect the brand system tokens?
- Are Geist Mono strings used for all URL/data displays?
- Is the hero mockup the visual center of attention above the fold?
- Does the page feel like something a senior engineer would trust?
- Is the primary blue used sparingly (max 3–4 instances)?
- Is the gold accent used in max 1 place?
- No gradients, no heavy drop shadows on text, no rounded pills?
- Does the dark section (#0B0E15) feel immersive, not generic?
- Is copy direct, technical, and free of startup buzzwords?

</implementation-rules>
