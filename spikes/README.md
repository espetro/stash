# spikes/

Throwaway de-risking spikes. **Not part of the pnpm workspace.**

## Isolation rule — do not break it

`pnpm-workspace.yaml` globs are `apps/*` and `packages/*` **only**. Do **not**
add `spikes/*` (or `spikes`) to that file. Spikes have their own throwaway
dependency trees (here: a Go module with a cgo dependency, plus a standalone
`bun install` in `crdt-interop/ts/`) that must never be hoisted into the repo
root `node_modules` or the lockfile.

Each spike is self-contained under `spikes/<name>/` with its own `RESULTS.md`.
Delete a spike once its findings have been folded into a spec or an ADR.
