# @stash/mirror

Non-Cloudflare mirror origin (F13): one portable app mounting the relay
(@stash/server-core), the /s decode + /api/title handlers extracted from
apps/viewer/functions, a /llms.txt probe target, and /health.

Provider decision (W5): Deno Deploy (entry-deno.ts). Node dev server:
`pnpm dev`. Storage is runtime config (`MIRROR_STORAGE=deno-kv|redis|
vercel-kv|memory`); default memory has no native TTL, so production MUST
pick a TTL-capable backend so short links expire (7d ceiling).

Rate limiting is in-process and FAILS OPEN (deliberate divergence from
the primary, which fails closed): the mirror is the availability path
during a primary outage and a per-instance limiter is advisory only.
