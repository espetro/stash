# 2026-08-22 — v0.8.1 parallel implementation gotchas

Learnings from orchestrating 6 parallel subagents on the navbar/settings
release. Useful before running another parallel codegen on this repo.

## Pre-existing environment failure (NOT caused by parallel work)

`apps/viewer/functions/_vendor/brotli_wasm.js` is missing from the working
tree (only `brotli_wasm_bg.wasm` exists). This causes:

- `pnpm --filter stash-viewer run tscheck` to fail with
  `TS2307: Cannot find module '../_vendor/brotli_wasm.js'`
- `pnpm --filter stash-viewer run test` to surface 2 suite-level failures
  (`agent-fetch.test.ts`, `functions-brotli.test.ts`)

This is reproducible on the unmodified tree (verify via
`git stash` of working changes). Out of scope for v0.8.1; track in
followups for someone working on the Cloudflare Functions layer.

## Parallel subagent surface isolation

When orchestrating multiple subagents on tightly-coupled modules, give
each one an EXPLICIT whitelist of files. Even with that, expect:

- **i18n helpers** (`flattenMessages`) — the existing implementation only
  flattens true nested objects, so two valid layouts coexist: flat
  (`"nav.home": "Home"`) and nested (`"nav": { "home": "Home" }`). One
  agent added new keys nested (es/fr/ru) and one flat (en.json). Both
  resolve via `t()`; agents either need explicit alignment on shape or
  the orchestrator fixes structure post-hoc.
- **Shared exports** — `Theme` is not exported from `@stash/theme`'s
  barrel, so the ThemeSwitcher agent had to redeclare a local
  `Preference` type. Worth fixing in `@stash/theme`'s index.ts.
- **`LanguageSelector.variant`** — multiple call sites pass
  `variant="card"` (AppHeader.tsx, TabViewer.tsx). The Navbar-rewrite
  agent had to sweep and drop those prop usages transitively.

## Validating parallel work

- `pnpm --filter stash-viewer run tscheck` isolated the diff quickly
  (only the brotli error survived). Use package-scoped scripts to
  reduce noise from unrelated package failures.
- Astro render can be smoke-tested from the built `dist/` over
  `python3 -m http.server`, but the **Radix portals hydrate client-side**
  — you won't see dropdown content in the snapshot until the JS runs.
  Use `playwright-cli --raw eval` against
  `document.querySelector('[role=menu]')` to confirm dropdown content
  rendered.

## Settings dropdown — portaled menus NOT in snapshot tree

`Radix DropdownMenu` portals into `document.body`. Playwright's
accessibility snapshot only follows DOM order; `find "Theme"` against
the snap won't surface dropdown content. Instead:

```js
playwright-cli --raw eval "
  JSON.stringify(Array.from(document.querySelectorAll('[role=menu]')).map(c => ({
    state: c.getAttribute('data-state'),
    text: (c.textContent||'').slice(0,200)
  })))
"
```

returns the open menus.

## ClassName duplication when wrapping Radix primitives

`<NavigationMenuLink asChild><a className="..." />` will concatenate the
prim's own `cn()` style with the consumer's className verbatim — without
deduplication. The shadcn `NavigationMenuLink` we ship applies
`navigationMenuTriggerStyle()` by default, which double-applied the
identical Tailwind classes (visible as repeated tokens in the rendered
HTML). Fix: have `NavigationMenuLink` only set the bare minimum (e.g.
`outline-none`) and let the consumer apply the visual style, since each
caller has slightly different pill styles anyway.

## Numeric class duplication is harmless visually

Even with duplicated tokens, browsers ignore the second copy of a
matching class — but it bloats the HTML and confuses future audits.
Always audit built HTML for repeated className tokens after a prim edit.
