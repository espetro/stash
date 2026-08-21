---
"@stash/extension": minor
---

Experimental in-extension agent server via `@stash/server-core`: the extension background can host the stash server + MCP bridge locally. The shortener worker is now a thin adapter over the same runtime-agnostic server package, with per-IP rate limiting (RL_STASH/RL_MCP, fail-open) ported into server-core.
