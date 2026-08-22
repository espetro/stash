# 2026-08-22 — Floating pill navbar + Settings dropdown (v0.8.1)

## Decisions

- **Floating pill nav**: replaces the full-bleed sticky bar with a shadcn-style
  floating pill (rounded-full, `bg-card/80 backdrop-blur shadow-md`). Pairs
  with a separate Settings pill on the right. Logo lives outside the pill on
  the left. Both pills live inside a `pointer-events-none` shell with two
  `pointer-events-auto` children for click-through protection.
- **Radix NavigationMenu**: viewport-free — each
  `NavigationMenuContent` is dropped; the trigger is a plain link. This
  matches the `brioso` reference implementation that dropped the shared
  Viewport. `tailwindcss` animation classes (`tw-animate-css`) drive open
  states.
- **Settings dropdown**: Radix `DropdownMenu` with Theme row (compact 3-button
  `ThemeSwitcher`) and Language row (sub trigger rendering current locale
  flag + label, submenu lists the four supported languages with a check on
  the active one).
- **ThemeSwitcher 3-state**: light / system / dark. Tracks `preference` and
  `effectiveTheme` separately so the system button shows `aria-pressed=true`
  when preference=system even if the actual visual state is light or dark.
  Sliding selector width is `calc(33.333% - 1.333px)` and `left` cycles
  2px / 33% / calc(66.666% - 0px).
- **Footer**: theme switcher + language selector removed; only GitHub link,
  Privacy, Terms, and copyright survive. Footer grid goes from
  `1fr auto 1fr` to `1fr 1fr`.
- **Marketing placeholder links**: Products/Solutions/Resources/Developers/
  Enterprise/Pricing/Contact Sales link to `#` with `aria-disabled` styling
  until real destinations exist.
- **Mobile**: `<= 767px` collapses to `[Logo] [Settings]`; nav-links hidden
  via existing CSS. Hamburger sheet deferred to v0.8.2.

## Gotchas

- `radix-ui@^1.4.3` already re-exports `NavigationMenu` via the umbrella
  namespace — no need for a separate `@radix-ui/react-navigation-menu` dep.
- `@stash/theme` already supports `"system"` theme; only `ThemeSwitcher`
  UI needed updating.
- The view-transition radial-circle animation is identical across
  `ThemeSwitcher.tsx` and `Footer.astro`; `ThemeSwitcher.tsx` is now the
  single source of truth.
- `LanguageSelector.tsx`'s `variant="navbar"` is unused after the migration
  to the Settings dropdown — the variant prop is dropped entirely.
- i18n `theme.*` / `language.*` keys are retained even though the Footer
  no longer uses them — the Settings dropdown reuses `theme.light` /
  `theme.dark` for button aria-labels (and could reuse labels later).