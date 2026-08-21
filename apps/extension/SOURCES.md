# Source Code Build Instructions

This archive contains the complete, human-readable source for the Stash Firefox
extension, as required by the Mozilla Add-ons review process.

## What's in this archive

```
extension/               # apps/extension — extension source (WXT project)
packages/codec           # URL payload encoding (brotli + msgpack)
packages/shared          # shared types and helpers
packages/server-core     # runtime-agnostic stash server logic
packages/theme           # shared design tokens (CSS)
pnpm-workspace.yaml      # workspace definition (root)
pnpm-lock.yaml           # dependency lockfile (root)
package.json             # root workspace package.json
```

To reproduce the monorepo layout AMO review builds against, place
`extension/` at `apps/extension/` and `packages/*` at the repository root.

## Build requirements

- Node.js 24+
- pnpm 11+ (`corepack enable` or `npm i -g pnpm`)

## Building

The extension is part of a pnpm monorepo. From the repository root:

```bash
pnpm install
cd apps/extension
pnpm run build:firefox
```

Output: `apps/extension/.output/stashextension-<version>-firefox.zip`
(the submitted package) and `.output/firefox-mv2/` (unpacked).

## Notes for reviewers

- **Bundler**: built with [WXT](https://wxt.dev) (Vite-based). Minification,
  chunking and content hashing are produced by the bundler, not hand-written.
- **WebAssembly**: `brotli_wasm_bg.wasm` is the unmodified binary from the
  [`brotli-wasm`](https://www.npmjs.com/package/brotli-wasm) npm package
  (version pinned in `package.json`). It is loaded from the extension bundle
  and performs local compression of tab payloads. It is not remotely hosted
  code.
- **Workspace packages**: `@stash/codec`, `@stash/shared`,
  `@stash/server-core` and `@stash/theme` are first-party packages included
  under `../../packages/` in this archive.
- The `wasm-unsafe-eval` CSP declaration exists solely to allow instantiation
  of the bundled Wasm module; no `eval` or `Function` constructor is invoked
  with runtime-derived strings.
