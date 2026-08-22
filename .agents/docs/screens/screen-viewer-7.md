---
screen: viewer-7
name: Privacy / Terms
route: /privacy, /terms
file: apps/viewer/src/pages/privacy.astro
---

```text
+--------------------------------------------------+
| Privacy-First by Design        /  User Agreement |
| ...prose sections...            ...numbered      |
|                                  headings...     |
+--------------------------------------------------+
```

Two static legal pages using the base `Layout.astro`:

- `/privacy` (`privacy.astro`): h1 "Privacy-First by Design" followed by
  prose sections on data handling.
- `/terms` (`terms.astro`): h1 "User Agreement" with numbered
  `term-heading` sections (Acceptance of Terms, Use License, Privacy,
  Open Source License, ...).

## Elements

| Element | State | Description |
|---|---|---|
| Page title | always | h1 with `page-title` class |
| Prose / numbered headings | always | Static content, no interactive state |

## Behavior

- Fully static Astro pages; no client JS beyond the shared layout theme
  handling. Linked from the landing footer.
