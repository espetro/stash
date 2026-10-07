# @stash/shortener

## 0.2.5

### Patch Changes

- @stash/shared@0.10.5

## 0.2.4

### Patch Changes

- @stash/shared@0.10.4

## 0.2.3

### Patch Changes

- @stash/shared@0.10.3

## 0.2.2

### Patch Changes

- @stash/shared@0.10.2

## 0.2.1

### Patch Changes

- @stash/shared@0.10.1

## 0.2.0

### Minor Changes

- 524f935: feat(server-core): dual-mode zero-trust relay — `POST /api/stash` accepts `{ciphertext}` (stored opaque, `enc` marker) alongside legacy `{payload}` (validated plaintext, stored readable). `GET /s/:id` gates on `entry.enc`: encrypted entries return a ciphertext envelope (`?format=json`), fail closed 409 for md/txt, and redirect to `viewer?id=<id>&relay=<origin>`; plaintext entries keep full decode/format/`#p=` behavior so agent flows and pre-existing links keep working. MCP `stash_get` fails closed on encrypted entries.

### Patch Changes

- Updated dependencies [e3a02fb]
- Updated dependencies [b635f89]
- Updated dependencies [5f44887]
- Updated dependencies [7007184]
  - @stash/shared@0.10.0

## 0.1.5

### Patch Changes

- Updated dependencies [2443a0b]
  - @stash/shared@0.9.0

## 0.1.4

### Patch Changes

- @stash/shared@0.8.1

## 0.1.3

### Patch Changes

- @stash/shared@0.8.0

## 0.1.2

### Patch Changes

- @stash/shared@0.7.1

## 0.1.1

### Patch Changes

- @stash/shared@0.7.0
