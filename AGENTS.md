# Guidelines

- Implementation plans are located in `.omo/plans/`
- When asked to save session progress, prepare a summary of the session and save it at `.omo/sessions/`

## Development Guardrails

This project uses the following code quality scripts (centralized via Turbo):

### Available Scripts

**Format** - Auto-format code with oxfmt (oxfmt doesn't support .astro files):

```bash
pnpm run format        # Format all packages
pnpm --filter stash-viewer run format    # Format viewer only
pnpm --filter stash-extension run format # Format extension only
```

> **Note:** `stash-viewer` uses prettier for `.astro` files (prettier-plugin-astro) alongside oxfmt for TS/TSX. The combined command is: `oxfmt --write 'src/**/*.{ts,tsx}' && prettier --write 'src/**/*.astro'`

**Lint** - Check code with oxlint:

```bash
pnpm run lint          # Lint all packages
pnpm --filter stash-viewer run lint      # Lint viewer only
pnpm --filter stash-extension run lint   # Lint extension only
```

**Type Check** - Run TypeScript compiler without emit:

```bash
pnpm run tscheck       # Type check all packages
pnpm --filter stash-viewer run tscheck   # Check viewer only
pnpm --filter stash-extension run tscheck # Check extension only
```

### Pre-commit Checklist

Before committing changes, run:

```bash
pnpm run validate # Run all backpressure checks (tscheck, lint, format)
pnpm run build    # Ensure builds pass
```

> **Note:** `validate` runs TypeScript, Lint, and Format checks and shows a ✅/⚠️/❌ status for each. It acts as a unified "all checks" command that reduces verbosity.

All these commands are orchestrated via Turbo for optimal performance.

## Design Tokens

Design tokens for all apps are centralized at `content/docs/designtoken.md`. All `@apps/*` implementations must follow these tokens for colors, typography, spacing, and shadows.

## Icon Library

Use `react-icons` for all icons in this project:

- **`@apps/viewer`** — FontAwesome 6 icons (`/fa6`)
- **`@apps/extension`** — Lucide React icons (`/lu`)

Example imports:

```typescript
// viewer
import { FaCopy } from 'react-icons/fa6'

// extension
import { LuCopy } from 'react-icons/lu'
```

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
