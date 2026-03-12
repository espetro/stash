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
