---
title: Agents & MCP
description: Give AI agents access to your tabs and local stash library via MCP, in the extension or through the hosted shortener.
---

Stash speaks the [Model Context Protocol](https://modelcontextprotocol.io) (MCP) on two surfaces: locally inside the extension, and as a hosted endpoint on the shortener worker. Agents can read your open tabs, manage your local stash library, and create or decode share links.

## Extension MCP server (local, always on)

The extension runs an MCP server inside its background service worker over a Chrome runtime port, so an agent on your machine can work with your real browser state. All data stays in `browser.storage.local`; nothing leaves your machine.

Available tools:

| Tool | Description |
|------|-------------|
| `stash_snapshot_tabs` | Read-only snapshot of the tabs currently open in this browser window (url + title) |
| `stash_list` | List local stashes (id, title, tags, item counts, timestamps) |
| `stash_get` | Fetch a local stash by id, including its full item list |
| `stash_create` | Create and persist a new local stash from a list of URLs (with optional titles), title, tags and note |
| `stash_update` | Update a local stash's title, tags, note, or items by id |
| `stash_delete` | Delete a local stash by id |
| `stash_search` | Search local stashes by a substring match over title, tags and note |
| `stash_decode` | Decode a stash payload string (the `?p=` value from a share URL) into its title, items, tags and note |

A client connects by opening a runtime port named `mcp` to the extension. AI agents with native extension MCP support pick this up automatically; others can attach via an MCP client that transports over the Chrome extension port.

## Hosted MCP endpoint (shortener)

If you run the shortener worker (see [Self-Hosting](/self-hosting)), it exposes a stateless Streamable HTTP MCP server at `POST /mcp`, plus a discovery card at `GET /.well-known/mcp-server-card`. It is rate limited to 60 requests per minute per IP.

Available tools:

| Tool | Inputs | Description |
|------|--------|-------------|
| `stash_create` | `title?`, `urls` (min 1), `ttlDays` (1, 7 default, 14 or 30) | Create a stash: a short shareable link bundling multiple URLs. Returns the short id and share URL |
| `stash_get` | `id` (6-character stash id) | Fetch a stash by its short id and return its title and items |
| `stash_decode` | `payload` | Decode a stash payload string (the `?p=` value from a stash share URL) into its title and items |

Note that the hosted tools operate on short links stored in the worker's KV (with a server-side TTL), not on your local stash library.

## Agent-friendly HTTP API

The viewer also serves structured data for agents, no MCP needed:

- `/json?p=<payload>` returns the decoded stash as JSON, including `tags` and `note` (payload v6).
- `/md?p=<payload>` returns it as Markdown.
- `/api/openapi.json` publishes the OpenAPI schema.
- `/llms.txt` gives an LLM-oriented overview of the endpoints.
