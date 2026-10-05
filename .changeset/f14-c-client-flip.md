---
"@stash/extension": minor
"stash-viewer": minor
---

feat(extension,viewer): zero-trust client flip — the extension's "Shorten link" and the viewer's own short-link creation now encrypt the payload client-side (AES-256-GCM, per-share 128-bit key) and upload only ciphertext; share URLs carry the key in `#<key>` (never sent to any server). The viewer decrypts relayed `/s?id=<id>&relay=<origin>#<key>` links locally — fetching the ciphertext envelope from the minting relay (`&relay=`, http(s) origins only) — fails closed on missing key, tampered ciphertext, or expired entries. Failures fall back silently to self-contained `#p=` links.
