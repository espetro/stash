---
title: Agent Server
description: Experimental opt-in server mode that lets AI agents create and fetch stashed share links
---

Stash can run a small HTTP server inside the extension itself. This is an **experimental feature, off by default**, aimed at AI agents and automation tools.

## Enabling the Server

1. Open the extension's Options page.
2. Toggle **Experimental Server** (setting `experimentalServer`) on.

With the flag on, the extension hosts a stash server in its background service worker and exposes it over two transports: a message bridge and additional MCP tools.

## Share URL Scheme

Stashed links use a pseudo-origin that points at the extension itself:

```
chrome-extension://<extension-id>/s/<stash-id>
```

Unlike normal share links, these resolve only while the extension is installed and running. The data lives in `browser.storage.local` on your machine, with a per-entry TTL and a 500-entry cap. Nothing is sent to any external server.

## Message Bridge Protocol

Manifest V3 extensions cannot open network ports, so requests travel over messaging. Send a request:

```json
{
  "type": "stash-bridge-request",
  "id": 1,
  "method": "GET",
  "url": "/s/some-id",
  "headers": {},
  "body": null
}
```

The extension replies with:

```json
{
  "type": "stash-bridge-response",
  "id": 1,
  "status": 200,
  "headers": {},
  "body": "..."
}
```

There are two ways to deliver a request:

- **From another extension**: call `browser.runtime.sendMessage(extensionId, request)`. Stash is listed in `externally_connectable`, so this works cross-extension.
- **From a web page or hosted agent**: `window.postMessage` the request to the page. Stash's content script relays it to the background server and posts the response back.

## Using fetchViaBridge

The helper `fetchViaBridge(send, url, init)` in `apps/extension/lib/server/client.ts` wraps the protocol with fetch-like semantics. Pass it the `send` function for your transport:

```ts
import { fetchViaBridge } from "./lib/server/client";

// send(request) delivers the message and resolves with the response
const res = await fetchViaBridge(send, `chrome-extension://${extId}/s/${id}`);
const body = await res.text();
```

## MCP Tools

With the flag enabled, the extension's background MCP server additionally exposes `stash_create_stored` and `stash_get_stored`, mirroring the existing tools but storing the payload server-side with a TTL of 1, 7, 14, or 30 days.
