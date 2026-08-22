---
screen: docs-1
name: Starlight docs shell
route: /docs (and /docs/<slug>)
file: apps/viewer/astro.config.mjs
---

```text
+--------------------------------------------------------------+
| Stash Documentation          (search)           (theme) (lang)|
+--------+-----------------------------------------------------+
| Sidebar|                                                     |
| Getting Started                                             | |
|   User Guide                                                | |
|     Using the Extension                                     | |
|     Sharing Tabs                                            | |
|     Customization                                           | |
|   About                                                     | |
|     Privacy & Data                                          | |
|     Agents & MCP                                            | |
|     FAQ                                                     | |
|     Self-Hosting                                            | |
+--------+-----------------------------------------------------+
|              site footer (Starlight default)                 |
+--------------------------------------------------------------+
```

## Elements

| Element | State | Description |
|---|---|---|
| Site title | always | "Stash Documentation"; a head script rewrites its home link to `/docs` |
| Sidebar | always | Getting Started (top-level link), User Guide group, About group, as configured in `astro.config.mjs` |
| Search / theme / lang | always | Starlight built-ins |
| Page content | per slug | Markdown from `content/docs/*.md` with Starlight frontmatter (title, description) |

## Behavior

- Slugs: `getting-started`, `using-extension`, `sharing-tabs`,
  `customization`, `privacy-and-data`, `agent-server`, `faq`,
  `self-hosting`.
- The `starlightDocsPrefix` integration keeps docs links under `/docs`
  while sharing the viewer origin.
