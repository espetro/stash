# /s header redesign — issue #64 (share + app surfaces)

Spec source: `.github issue #64` — "[design] Header/layout redesign: landing, /s/, app routes, popup tabs". Scope of this plan: the `/s/` surfaces only (landing already shipped its block bar; popup tabs tracked separately).

## Design

One `SiteHeader` component (`apps/viewer/src/components/SiteHeader.tsx`), two variants:

- **share** (`/s/<payload>`): slim in-flow header constrained to the 640px card column (`max-w-160 mx-auto`). Left: logo (→ `/`). Right: "Get Stash" link (→ `/`) + `AppearanceMenu`.
- **app** (`/s/new`, `/stashes`): same 640px-constrained in-flow header — replaces the floating `AppHeader` pill. Left: back chevron (when `history.length > 1`) + segmented control `New · Library` (links `/s/new`, `/stashes`; active state per `active` prop). Right: `AppearanceMenu`.

`AppearanceMenu` (`apps/viewer/src/components/AppearanceMenu.tsx`): one Radix dropdown (sliders icon) with a Theme section (Light / System / Dark, check on active → `setTheme` from `@stash/theme`) and a Language section (4 locales, check on active → `useLocale().setLang`). Theme resolves the #64 open point as **labelled 3-option in a menu**.

## Page changes

- `TabViewer` (`/s/`): renders `<SiteHeader variant="share" />` above `SharedCard`; theme/lang row removed from inside the card; footer primaries become **Open all** (opens every item) and **Save to my library** (`createStash` into the viewer-local store → "Saved to library" state + link to `/stashes`). Share QR split button + "New stash" demote to outline/secondary. Dirty-state `Save edited` flow unchanged.
- `MyStashes` (`/stashes`): `<AppHeader />` → `<SiteHeader variant="app" active="library" />`.
- `NewStashForm` (`/s/new`): `<AppHeader />` → `<SiteHeader variant="app" active="new" />`.
- `AppHeader.tsx` deleted (superseded by `SiteHeader`).

## i18n

New keys in en/es/fr/ru (+ `intl-ai.lock.json` entries, sha1 sourceHash, origin `human`):

| key | en | es | fr | ru |
|---|---|---|---|---|
| `nav.getStash` | Get Stash | Obtener Stash | Obtenir Stash | Скачать Stash |
| `nav.new` | New | Nuevo | Nouveau | Создать |
| `nav.library` | Library | Biblioteca | Bibliothèque | Библиотека |
| `theme.system` | System | Sistema | Système | Системная |
| `appearance.label` | Appearance | Apariencia | Apparence | Оформление |
| `sharedTabs.openAll` | Open all | Abrir todo | Tout ouvrir | Открыть все |
| `sharedTabs.saveToLibrary` | Save to my library | Guardar en mi biblioteca | Enregistrer dans ma bibliothèque | Сохранить в библиотеку |
| `sharedTabs.savedToLibrary` | Saved to library | Guardado en la biblioteca | Enregistré dans la bibliothèque | Сохранено в библиотеке |

## Screen docs

Update `screen-viewer-2.md` (/s/new), `screen-viewer-3.md` (/s tab viewer), `screen-viewer-4.md` (/stashes) ASCII + element tables.

## Gates

`pnpm run validate` + `pnpm run build` + viewer tests; screenshots of all three surfaces for the PR.
