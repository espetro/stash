# Contributing to Stash

Thank you for your interest in contributing to Stash, a browser extension for sharing tab snapshots.

## Project Overview

Stash is a monorepo containing:
- **`apps/extension`** — The WXT-based cross-browser extension (Chrome + Firefox)
- **`apps/viewer`** — The Astro static site that renders shared tab links
- **`packages/codec`** — Shared encoding/decoding logic
- **`packages/theme`** — Shared Tailwind theme

## Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/espetro/stash.git
cd stash

# 2. Install dependencies (requires pnpm)
pnpm install

# 3. Start the extension in dev mode
pnpm --filter stash-extension run dev

# 4. Start the viewer in dev mode  
pnpm --filter stash-viewer run dev
```

## Branch Structure

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code. Only updated via PRs from `develop` or hotfixes. |
| `develop` | Integration branch. All feature/fix PRs target this branch. |
| `feat/*`, `fix/*`, etc. | Short-lived feature branches. |

**Workflow:**
1. Create a branch from `develop`: `git checkout -b feat/your-feature develop`
2. Make your changes
3. Open a PR targeting `develop`
4. CI runs commitlint to validate your commit messages

## Commit Message Format (Conventional Commits)

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. This is enforced by CI on every PR to `develop`.

### Format
```
<type>(<optional scope>): <description>

[optional body]

[optional footer]
```

### Types and Changelog Impact

| Type | Description | Appears in Changelog |
|------|-------------|---------------------|
| `feat` | New feature | ✅ Under "Features" |
| `fix` | Bug fix | ✅ Under "Bug Fixes" |
| `chore` | Maintenance, dependencies | ❌ |
| `docs` | Documentation only | ❌ |
| `refactor` | Code restructure, no behavior change | ❌ |
| `test` | Adding or updating tests | ❌ |
| `ci` | CI/CD configuration | ❌ |
| `feat!` | Breaking change | ✅ Under "BREAKING CHANGES" |

### Examples

```bash
# Good ✅
feat(popup): add keyboard shortcut to stash all tabs
fix(encoder): handle URLs with unicode characters correctly
chore: upgrade wxt to v0.20
docs: update Firefox submission instructions
feat!: remove support for manifest v2

# Bad ❌
Added dark mode
WIP
Fix bug
update stuff
```

### Scope (optional)
Use scope to indicate the affected area:
- `feat(popup): ...`
- `fix(encoder): ...`
- `chore(deps): ...`

## Code Quality

Before opening a PR, run:

```bash
pnpm run format   # Auto-format code
pnpm run lint     # Check for linting issues
pnpm run tscheck  # TypeScript type checking
pnpm run build    # Ensure the build passes
```

## Release Process

Releases are triggered manually by the maintainer when enough changes have accumulated (typically every 3–7 days). As a contributor, you don't need to manage releases — just write good conventional commits and they'll automatically appear in the next release's changelog.

For full release process details, see [AGENTS.md](./AGENTS.md#release-process).

## Pull Request Guidelines

- Target the `develop` branch (not `main`)
- Write a clear PR description explaining the change
- Ensure all CI checks pass
- Keep PRs focused — one feature/fix per PR
