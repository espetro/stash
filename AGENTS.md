# Guidelines

- Implementation plans are located in `.omo/plans/`
- When asked to save session progress, prepare a summary of the session and save it at `.omo/sessions/`

## Session notes (memory)

`.agents/notes/` contains learnings from previous sessions: gotchas,
decisions, and non-obvious project knowledge. Read relevant notes before
starting work. Record your own learnings there as
`<date>-<learning-short-description>.md`
(e.g. `2026-08-22-payload-v6-codec.md`). See
[.agents/notes/README.md](.agents/notes/README.md).

## Repo structure

| Path | Purpose |
|------|---------|
| `apps/extension` | WXT cross-browser extension (Chrome + Firefox) |
| `apps/viewer` | Astro viewer + docs site (Cloudflare Pages) |
| `apps/shortener` | Cloudflare Worker: short links + hosted MCP |
| `packages/codec` | Payload encode/decode (v4/v5/v6) |
| `packages/server-core` | Runtime-agnostic stash server used by worker |
| `packages/shared`, `packages/theme`, `packages/e2e` | Shared UI, styles, Gauge+Playwright e2e |

Per-package guidance lives in `apps/*/AGENTS.md` and `packages/*/AGENTS.md`.

## Development Guardrails

Code quality scripts are centralized via Turbo:

```bash
pnpm run validate  # all backpressure checks (tscheck, lint, format) with ✅/⚠️/❌ status
pnpm run build     # all packages
```

Package-scoped variants work too, e.g. `pnpm --filter stash-viewer run tscheck`.

### Pre-commit Checklist

Before committing changes, run:

```bash
pnpm run validate
pnpm run build
```

## Design Tokens

Design tokens for all apps are centralized at [`.agents/docs/designtoken.md`](.agents/docs/designtoken.md). All `@apps/*` implementations must follow these tokens for colors, typography, spacing, and shadows.

## Icon Library

Use `react-icons` for all icons in this project:

- **`@apps/viewer`** — FontAwesome 6 icons (`/fa6`)
- **`@apps/extension`** — Lucide React icons (`/lu`)

## Release Process

Releases use [changesets](https://changesets.tools/) for versioning and a tag-triggered GitHub workflow for publishing.

### Branching Model
- Feature/fix branches → PRs to `main` (Conventional Commits format)
- `develop` is the integration branch; fast-forward it to `main` after each release
- Pushing to `main` auto-deploys the viewer (Cloudflare Pages) and shortener worker (deploy.yml)

### Cutting a Release

1. **Bump versions via changesets**
   - `pnpm changeset` to describe the changes (minor/patch bumps)
   - Commit the changeset and merge it to `main`
   - `pnpm changeset version` consumes it, bumping all version-locked packages in lockstep
2. **Validate on main**
   - `pnpm run validate` (tscheck, lint, format)
   - `pnpm run build`
3. **Push to main** — web deploys run automatically
4. **Tag the release**: `git tag vX.Y.Z && git push origin vX.Y.Z`
   - `release.yml` builds Chrome + Firefox zips (`VITE_VIEWER_ORIGIN=https://stash.illo.fyi`) and creates the GitHub Release with the zips attached
5. **Store submission** (manual)
   - Chrome: download the chrome zip from the Release, upload at the Web Store Developer Dashboard
   - Firefox: download the firefox zip, upload at addons.mozilla.org developer hub
6. **Post-release sync**: fast-forward `develop` to `main` and push

### Conventional Commits

All commits follow the Conventional Commits format — see [CONTRIBUTING.md](./CONTRIBUTING.md#commit-message-format-conventional-commits).

## UI Screens registry

`.agents/docs/screens/` is the canonical ASCII map of every user-facing screen (extension popup, viewer pages, dialogs). Update the affected screen files whenever you change UI layout, copy, or flows — stale ASCII is worse than none. See `.agents/docs/screens/INDEX.md`.

## Project Management

In case of working on a git-tracked project, **all plans and implementations must be linked to a refined task in a Project** (usually Github Project, but could also be Linear, local project, etc.). No orphan work.

If no GitHub Project is set for the project, raise it and ask the user to set up a GitHub project and share the URL. Then, make sure to keep it in the project's AGENTS.md so next iterations don't miss it.

A task is **refined** when it has:
- Iteration/Quarter set → maps to a roadmap milestone in [`ROADMAP.md`](ROADMAP.md)
- Effort estimate (S/M/L/XL) → includes testing + bug potential per contact surface
- Start date + Target date → scheduled in the roadmap
- Classification label (`feature` / `bug` / `cosmetic` / `infra`) → drives client positioning

All agent plans go to `<PROJECT_ROOT>/.agents/plans/<date>-<purpose>.md`. E.g. `<PROJECT_ROOT>/.agents/plans/2026-06-01-setup-auth.md`. Plans must exist on disk before implementation begins.
