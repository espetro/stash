---
"@stash/server-core": minor
---

Unify agent content negotiation on `GET /s/:id`: add the `?format=json|md|txt` query param (with the `markdown|plain|text` aliases) using the shared negotiation contract from `@stash/shared`, taking precedence over `Accept` header negotiation; unknown `format` values now return a 400 JSON error instead of falling through to an HTML redirect.

The legacy `/s/:id.json|.md|.txt` suffix routes are deprecated: they now 301-redirect to `/s/:id?format=<fmt>` and will be removed in the next release. llms.txt and the OpenAPI spec are deployed artifacts, so agents that cached the suffix routes keep working for one release. The discovery card at `/.well-known/mcp-server-card` now lists an `endpoints` array (HTTP decode surface, openapi.json, llms.txt).
