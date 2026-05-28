# Guidelines

- Implementation plans are located in `.sisyphus/plans/`
- When asked to save session progress, prepare a summary of the session and save it at `.sisyphus/sessions/`

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
