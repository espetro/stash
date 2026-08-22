# 2026-08-22: ThemeSwitcher 3-button upgrade

The viewer ThemeSwitcher now has three buttons (light / system / dark) and
renders only the inner pill (no outer `flex justify-center`). Callers wrap
with their own width — SettingsMenu uses `w-full` to make it fill the
dropdown, existing bare callers (AppHeader, TabViewer) still render at
natural content size because the pill switched from `flex` to `inline-flex`.

`@stash/theme` does **not** export the `Theme` type from its barrel — only
`StorageAdapter`. Local consumers must redeclare `"light" | "dark" | "system"`
or extend the package export.

Pre-existing viewer issues (not from this change):
- `functions/_shared/decode.ts` references `../_vendor/brotli_wasm.js` which
  is not present in the tree — causes tscheck + 2 test-suite load failures.
- `AppHeader.tsx` and `TabViewer.tsx` still pass `variant="card"` to
  LanguageSelector, but another agent removed that prop. Out of scope here.