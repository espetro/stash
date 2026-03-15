# Guidelines

- Implementation plans are located in `.sisyphus/plans/`
- When asked to save session progress, prepare a summary of the session and save it at `.sisyphus/sessions/`

## Development Guardrails

This project uses the following code quality scripts (centralized via Turbo):

### Available Scripts

**Format** - Auto-format code with oxfmt:
```bash
pnpm run format        # Format all packages
pnpm --filter stash-viewer run format    # Format viewer only
pnpm --filter stash-extension run format # Format extension only
```

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
pnpm run format   # Fix formatting
pnpm run lint     # Check for issues
pnpm run tscheck  # Verify types
pnpm run build    # Ensure builds pass
```

All these commands are orchestrated via Turbo for optimal performance.

## Release Process

Releases are cut manually using `release-it`. Only `apps/extension` is versioned.

### Branching Model
- Feature/fix branches → `develop` (PRs must use Conventional Commits format)
- When ready to release: open PR from `develop` → `main`, merge it
- Then trigger the release workflow

### Conventional Commits Format
All commits to `develop` must follow this format:
- `feat: <description>` — new feature (will appear in changelog under "Features")
- `fix: <description>` — bug fix (will appear in changelog under "Bug Fixes")
- `chore: <description>` — maintenance, deps, config (no changelog entry)
- `docs: <description>` — documentation only (no changelog entry)
- `refactor: <description>` — code change, no new feature or fix (no changelog entry)
- `feat!: <description>` or `BREAKING CHANGE:` footer — breaking change (bumps major)

Scopes are optional but recommended: `feat(popup): add tab count badge`

### Triggering a Release
1. Ensure all desired changes are merged to `develop`
2. Open a PR from `develop` → `main` and merge it
3. Go to GitHub → Actions → "Release Extension" → **Run workflow**
4. Choose bump type:
   - `patch` — for bug fixes only (0.2.0 → 0.2.1)
   - `minor` — for new features (0.2.0 → 0.3.0)
   - `major` — for breaking changes (0.2.0 → 1.0.0)
5. CI will automatically:
   - Bump version in `apps/extension/package.json`
   - Generate/update `apps/extension/CHANGELOG.md`
   - Create a git commit + `v{version}` tag on `main`
   - Create a GitHub Release with formatted release notes
   - Build Chrome + Firefox extensions with production URL
   - Attach ZIP artifacts to the GitHub Release:
     - `stash-extension-{version}-chrome.zip`
     - `stash-extension-{version}-firefox.zip`
     - `stash-sources-{version}.zip` (Firefox AMO source code requirement)
6. Download the ZIPs from the GitHub Release page
7. Submit manually to Chrome Web Store and Firefox Add-ons dashboards

### Post-Release Sync
After a release, the version bump commit is on `main`. Sync it back to `develop`:
```bash
git checkout develop
git merge main
git push origin develop
```

### What NOT to Version
- `apps/viewer` — deployed automatically via Vercel, no versioning needed
- `packages/*` — internal private packages, not released

### Release Artifacts Location
After triggering the release workflow, find ZIPs at:
**GitHub → Releases → v{version} → Assets**
